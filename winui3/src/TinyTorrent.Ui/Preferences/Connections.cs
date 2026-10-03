using System.ComponentModel;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Synapse;
using Windows.System;

namespace TinyTorrent_Ui;

internal sealed record ConnectionProfile(string Id, string Name, Uri Endpoint, string? Username)
{
    public override string ToString() => Name;
}

internal static class ConnectionProfiles
{
    private sealed record Store(string? SelectedId, IReadOnlyList<ConnectionProfile> Profiles);
    private static string Path => System.IO.Path.Combine(App.LocalPath, "connections.json");

    internal static string? SelectedId
    {
        get => Read().SelectedId;
        set => Write(Read() with { SelectedId = value });
    }

    internal static IReadOnlyList<ConnectionProfile> Load() => Read().Profiles;

    internal static NetworkCredential? ResolveCredentials(ConnectionProfile profile) =>
        string.IsNullOrEmpty(profile.Username) ? null : new NetworkCredential(profile.Username, Credentials.Read(profile.Id) ?? "");

    private static Store Read() => File.Exists(Path)
        ? JsonSerializer.Deserialize<Store>(File.ReadAllText(Path)) ?? throw new InvalidDataException("The saved connections could not be read.")
        : new(null, []);

    private static void Write(Store store)
    {
        string path = Path;
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path)!);
        string temporary = path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(store));
        File.Move(temporary, path, overwrite: true);
    }

    internal static async Task<ConnectionProfile?> Show(XamlRoot root)
    {
        static ScrollViewer Scroll(UIElement content) => new()
        {
            Content = content,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            IsTabStop = false
        };

        Store store;
        try { store = Read(); }
        catch (Exception error)
        {
            ContentDialog failure = new() { XamlRoot = root, Title = "Connections unavailable", Content = Scroll(new TextBlock { Text = error.Message, TextWrapping = TextWrapping.Wrap }), CloseButtonText = "Close" };
            Icons.Set(failure);
            await failure.ShowAsync();
            return null;
        }

        ComboBox profiles = new() { Header = "Saved connection" };
        profiles.Items.Add("New connection");
        foreach (ConnectionProfile profile in store.Profiles) profiles.Items.Add(profile);
        TextBox name = new() { Header = "Name" };
        TextBox endpoint = new() { Header = "RPC address", PlaceholderText = "https://host:9091/transmission/rpc" };
        TextBox username = new() { Header = "Username (optional)" };
        PasswordBox password = new() { Header = "Password" };
        foreach ((Control field, string key) in new (Control, string)[] { (profiles, "S"), (name, "N"), (endpoint, "A"), (username, "U"), (password, "P") })
        {
            field.AccessKey = key;
            field.AccessKeyInvoked += (_, args) => { field.Focus(FocusState.Programmatic); args.Handled = true; };
        }
        ToolTipService.SetToolTip(password, "Leave blank to keep the saved password. Passwords are stored in Windows Credential Manager.");
        ToolTipService.SetToolTip(endpoint, "HTTPS certificates must be trusted by Windows.");
        InfoBar status = new() { IsClosable = true };
        StackPanel fields = new() { Spacing = 12 };
        fields.Children.Add(status);
        fields.Children.Add(profiles);
        fields.Children.Add(name);
        fields.Children.Add(endpoint);
        fields.Children.Add(username);
        fields.Children.Add(password);
        ContentDialog dialog = new()
        {
            XamlRoot = root, Title = "Remote connections", PrimaryButtonText = "Connect", SecondaryButtonText = "Delete", CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            Content = Scroll(fields),
        };
        Icons.Set(dialog, primary: Lucide.Plug, secondary: Lucide.Trash2);
        ToolTipService.SetToolTip(dialog, "Connect saves this profile and selects it as the active connection.");
        int profileIndex = 0;
        int? requestedProfile = null;
        void LoadProfile(int index)
        {
            profileIndex = index;
            profiles.SelectedIndex = index;
            ConnectionProfile? profile = profiles.Items[index] as ConnectionProfile;
            name.Text = profile?.Name ?? "";
            endpoint.Text = profile?.Endpoint.AbsoluteUri ?? "";
            username.Text = profile?.Username ?? "";
            password.Password = "";
            status.IsOpen = false;
            dialog.IsSecondaryButtonEnabled = profile is not null;
        }
        profiles.SelectionChanged += (_, _) =>
        {
            int index = profiles.SelectedIndex;
            if (index < 0 || index == profileIndex) return;
            ConnectionProfile? profile = profiles.Items[profileIndex] as ConnectionProfile;
            bool dirty = name.Text != (profile?.Name ?? "") || endpoint.Text != (profile?.Endpoint.AbsoluteUri ?? "")
                || username.Text != (profile?.Username ?? "") || password.Password.Length != 0;
            if (!dirty) { LoadProfile(index); return; }
            requestedProfile = index;
            profiles.SelectedIndex = profileIndex;
            dialog.Hide();
        };
        int initialProfile = 0;
        for (int i = 0; i < store.Profiles.Count; i++)
            if (store.Profiles[i].Id == store.SelectedId) initialProfile = i + 1;
        LoadProfile(initialProfile);

        ConnectionProfile? saved = null;
        string provisionalId = Guid.NewGuid().ToString("N");
        bool Connect()
        {
            Control? invalid = name;
            try
            {
                if (string.IsNullOrWhiteSpace(name.Text)) throw new InvalidOperationException("Name is required.");
                invalid = endpoint;
                if (!Uri.TryCreate(endpoint.Text.Trim(), UriKind.Absolute, out Uri? address) || (address.Scheme != "http" && address.Scheme != "https") || string.IsNullOrEmpty(address.Host))
                    throw new InvalidOperationException("RPC address must be a complete HTTP or HTTPS address.");
                if (!string.IsNullOrEmpty(address.UserInfo)) throw new InvalidOperationException("Credentials are not allowed in the RPC address.");
                if (!string.IsNullOrEmpty(address.Fragment)) throw new InvalidOperationException("The RPC address cannot include a fragment.");
                ConnectionProfile? previous = profiles.SelectedItem as ConnectionProfile;
                string id = previous?.Id ?? provisionalId;
                string? user = string.IsNullOrWhiteSpace(username.Text) ? null : username.Text.Trim();
                invalid = password;
                if (user is not null && password.Password.Length == 0 && previous?.Username != user)
                    throw new InvalidOperationException("Password is required for this username.");
                ConnectionProfile profile = new(id, name.Text.Trim(), address, user);
                invalid = null;
                List<ConnectionProfile> updated = store.Profiles.ToList();
                int index = updated.FindIndex(p => p.Id == id);
                if (index < 0) updated.Add(profile); else updated[index] = profile;
                bool changingCredential = user is null || password.Password.Length != 0;
                string? previousSecret = changingCredential && previous?.Username is not null ? Credentials.Read(id) : null;
                if (user is null)
                {
                    Credentials.Delete(id);
                }
                else if (password.Password.Length != 0)
                {
                    Credentials.Write(id, user, password.Password);
                }
                try { Write(new(id, updated)); }
                catch (Exception saveError)
                {
                    if (changingCredential)
                    {
                        try
                        {
                            if (previousSecret is not null && previous?.Username is { } previousUser)
                                Credentials.Write(id, previousUser, previousSecret);
                            else Credentials.Delete(id);
                        }
                        catch (Exception restoreError)
                        {
                            throw new InvalidOperationException($"The connection was not saved, and its password change could not be undone. {saveError.Message} {restoreError.Message}");
                        }
                    }
                    throw;
                }
                saved = profile;
                return true;
            }
            catch (Exception error) { status.IsOpen = true; status.Severity = InfoBarSeverity.Error; status.Message = error.Message; invalid?.Focus(FocusState.Programmatic); return false; }
        }
        dialog.PrimaryButtonClick += (_, args) => args.Cancel = !Connect();
        KeyboardAccelerator commit = new() { Key = VirtualKey.S, Modifiers = VirtualKeyModifiers.Control };
        commit.Invoked += (_, args) =>
        {
            if (args.Handled || Dialogs.Modifiers != VirtualKeyModifiers.Control || Dialogs.HasPopup(dialog)) return;
            args.Handled = true;
            if (Connect()) dialog.Hide();
        };
        dialog.KeyboardAccelerators.Add(commit);
        Action? returnFocus = null;
        dialog.Opened += (_, _) =>
        {
            if (returnFocus is not { } focus) return;
            returnFocus = null;
            dialog.DispatcherQueue.TryEnqueue(() => focus());
        };
        while (true)
        {
            ContentDialogResult result = await dialog.ShowAsync();
            if (saved is not null) return saved;
            if (requestedProfile is { } requested)
            {
                requestedProfile = null;
                StackPanel discarded = new() { Spacing = 12 };
                discarded.Children.Add(new TextBlock { Text = (profiles.Items[profileIndex] as ConnectionProfile)?.Name ?? "New connection", TextWrapping = TextWrapping.Wrap, Style = (Style)Application.Current.Resources["BodyStrongTextBlockStyle"] });
                discarded.Children.Add(new TextBlock { Text = "Unsaved connection changes will be lost.", TextWrapping = TextWrapping.Wrap });
                ContentDialog confirmDiscard = new() { XamlRoot = root, Title = "Discard changes?", Content = Scroll(discarded), PrimaryButtonText = "Discard", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
                Icons.Set(confirmDiscard, primary: Lucide.Undo2);
                if (await confirmDiscard.ShowAsync() == ContentDialogResult.Primary) LoadProfile(requested);
                returnFocus = () => profiles.Focus(FocusState.Keyboard);
                continue;
            }
            if (result != ContentDialogResult.Secondary || profiles.SelectedItem is not ConnectionProfile deleted) return null;
            StackPanel deletion = new() { Spacing = 12 };
            deletion.Children.Add(new TextBlock { Text = deleted.Name, TextWrapping = TextWrapping.Wrap, Style = (Style)Application.Current.Resources["BodyStrongTextBlockStyle"] });
            deletion.Children.Add(new TextBlock { Text = "This removes the saved connection and its password.", TextWrapping = TextWrapping.Wrap });
            ContentDialog confirm = new() { XamlRoot = root, Title = "Delete connection?", Content = Scroll(deletion), PrimaryButtonText = "Delete", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
            Icons.Set(confirm, primary: Lucide.Trash2);
            if (await confirm.ShowAsync() != ContentDialogResult.Primary)
            {
                returnFocus = () => (TorrentPage.FindElement(dialog, element => element.Name == "SecondaryButton") as Control)?.Focus(FocusState.Keyboard);
                continue;
            }
            try
            {
                Write(new(store.SelectedId == deleted.Id ? null : store.SelectedId, store.Profiles.Where(p => p.Id != deleted.Id).ToArray()));
                try
                {
                    Credentials.Delete(deleted.Id);
                }
                catch (Exception deleteError)
                {
                    try { Write(store); }
                    catch (Exception restoreError)
                    {
                        throw new InvalidOperationException($"The password could not be deleted, and its connection could not be restored. {deleteError.Message} {restoreError.Message}");
                    }
                    throw;
                }
            }
            catch (Exception error)
            {
                ContentDialog failure = new() { XamlRoot = root, Title = "Connection could not be deleted", Content = Scroll(new TextBlock { Text = error.Message, TextWrapping = TextWrapping.Wrap }), CloseButtonText = "Close" };
                Icons.Set(failure);
                await failure.ShowAsync();
            }
            return null;
        }
    }
}

internal static class Credentials
{
    private const uint Generic = 1;
    private const uint LocalMachine = 2;
    private const int NotFound = 1168;
    private static string Target(string id) => "TinyTorrent/" + id;

    internal static string? Read(string id)
    {
        if (!CredRead(Target(id), Generic, 0, out nint pointer))
        {
            int error = Marshal.GetLastWin32Error();
            if (error == NotFound) return null;
            throw new Win32Exception(error, "Windows could not read the saved password.");
        }
        try
        {
            Credential credential = Marshal.PtrToStructure<Credential>(pointer);
            return Marshal.PtrToStringUni(credential.Blob, checked((int)credential.BlobSize / sizeof(char))) ?? "";
        }
        finally { CredFree(pointer); }
    }

    internal static void Write(string id, string username, string password)
    {
        byte[] bytes = Encoding.Unicode.GetBytes(password);
        nint blob = Marshal.AllocHGlobal(bytes.Length);
        try
        {
            Marshal.Copy(bytes, 0, blob, bytes.Length);
            Credential credential = new() { Type = Generic, TargetName = Target(id), Username = username, BlobSize = checked((uint)bytes.Length), Blob = blob, Persist = LocalMachine };
            if (!CredWrite(ref credential, 0)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not save the password.");
        }
        finally
        {
            Array.Clear(bytes);
            for (int i = 0; i < bytes.Length; i++) Marshal.WriteByte(blob, i, 0);
            Marshal.FreeHGlobal(blob);
        }
    }

    internal static void Delete(string id)
    {
        if (CredDelete(Target(id), Generic, 0)) return;
        int error = Marshal.GetLastWin32Error();
        if (error != NotFound) throw new Win32Exception(error, "Windows could not delete the saved password.");
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Credential
    {
        internal uint Flags;
        internal uint Type;
        internal string? TargetName;
        internal string? Comment;
        internal System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        internal uint BlobSize;
        internal nint Blob;
        internal uint Persist;
        internal uint AttributeCount;
        internal nint Attributes;
        internal string? TargetAlias;
        internal string? Username;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredWrite(ref Credential credential, uint flags);
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredRead(string target, uint type, uint flags, out nint credential);
    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredDelete(string target, uint type, uint flags);
    [DllImport("advapi32.dll")]
    private static extern void CredFree(nint credential);
}
