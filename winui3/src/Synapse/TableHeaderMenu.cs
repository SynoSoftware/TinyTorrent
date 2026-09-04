using Microsoft.UI.Xaml.Controls;

namespace Synapse;

/// <summary>
/// Section 12's generated header menu. It is table mechanics only and has no extension surface.
/// Every item invokes the operation its pointer gesture invokes, so a command and a gesture cannot
/// disagree about what a legal result is, and every item is enabled by the operation's own
/// predicate rather than by a second copy of the rule. Generic labels come from the control's own
/// resources; column names come from the host's <see cref="TableColumn.DisplayName"/>.
/// </summary>
internal static class TableHeaderMenu
{
    /// <summary>
    /// The menu for <paramref name="active"/>, or the one unused header space gets when there is no
    /// active column: the same menu without the actions that need one.
    /// </summary>
    internal static MenuFlyout Create(TableView owner, ResolvedColumn? active)
    {
        MenuFlyout menu = new();

        // Showing or hiding columns is a job you do several times in a row, and a menu flyout
        // closes on every invocation. WinUI has no stay-open switch — none of MenuFlyout,
        // MenuFlyoutItem, ToggleMenuFlyoutItem or MenuFlyoutSubItem exposes one — but the close
        // itself can be refused, so a column toggle raises this and nothing else does: every other
        // item is a one-shot command, and closing is right for those.
        bool holdOpen = false;

        // Refuse every close attempt while the flag is up, and never clear it here. A single
        // toggle produces more than one attempt — the submenu's dismissal and the root's — so a
        // handler that consumed the flag on the first refusal let the second one through, which
        // is what the owner saw: the menu still closing on a tick. The flag is dropped instead by
        // the toggle itself, on the next turn of the dispatcher, once those attempts are done, so
        // a later click outside still dismisses the menu normally.
        menu.Closing += (_, closing) => closing.Cancel = holdOpen;

        void HoldOpen() => holdOpen = true;
        void ReleaseWhenSettled() => menu.DispatcherQueue.TryEnqueue(() => holdOpen = false);

        if (active is null)
        {
            // A right-click on unused header space has no column to act on, so the whole menu is
            // about the column set and a submenu grouping it would be a door to the only room.
            // The toggles go in directly, under the one command that applies to all of them.
            // No icon on this one, and none on the toggles either. The list is a set of on/off
            // states, so the checkmark is the glyph being read; an icon column beside it would sit
            // empty on every row that has no icon to put there, and compete with the check on the
            // rows that did. A menu of commands carries icons on every item, and this is not one.
            menu.Items.Add(FitVisibleColumns(owner, icon: null));
            menu.Items.Add(new MenuFlyoutSeparator());

            foreach (MenuFlyoutItemBase toggle in ColumnToggles(owner, HoldOpen, ReleaseWhenSettled))
            {
                menu.Items.Add(toggle);
            }

            return menu;
        }

        menu.Items.Add(Command(
            TableResources.HideThisColumn,
            TableIcons.HideColumn(),
            owner.CanHideColumn(active),
            () => owner.SetColumnVisibility(active, false)));
        menu.Items.Add(ColumnsSubmenu(owner, HoldOpen, ReleaseWhenSettled));

        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Command(
            TableResources.FitThisColumn,
            TableIcons.Fit(),
            owner.CanFitColumn(active),
            () => owner.AutoFitColumn(active.Id)));
        menu.Items.Add(FitVisibleColumns(owner, TableIcons.Fit()));

        // No Narrow and no Widen. They stepped 8 DIPs and the menu closes on every invocation, so
        // widening the host's 150 DIP name column to something readable was thirteen right-clicks
        // and thirteen clicks. That is not a keyboard route to resizing, it is the appearance of
        // one, and Fit this column already gives the keyboard the outcome anyone actually wants in
        // a single invocation. If continuous keyboard resizing is wanted it belongs on the focused
        // header as a held key, where repeat does the work, not as a menu item invoked per step.

        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Command(
            TableResources.MoveLeft,
            TableIcons.MoveLeft(),
            owner.CanMoveColumnBy(active, -1),
            () => owner.MoveColumnBy(active, -1)));
        menu.Items.Add(Command(
            TableResources.MoveRight,
            TableIcons.MoveRight(),
            owner.CanMoveColumnBy(active, 1),
            () => owner.MoveColumnBy(active, 1)));

        return menu;
    }

    /// <summary>
    /// One toggle per declared column, hidden ones included. The last visible column's toggle is
    /// disabled, so no sequence of toggles reaches a table with nothing visible.
    /// </summary>
    /// <param name="holdOpen">
    /// Called before a toggle is applied, to stop the menu closing underneath it.
    /// </param>
    private static MenuFlyoutSubItem ColumnsSubmenu(TableView owner, Action holdOpen, Action releaseWhenSettled)
    {
        MenuFlyoutSubItem submenu = new() { Text = TableResources.Columns, Icon = TableIcons.Columns() };

        foreach (MenuFlyoutItemBase toggle in ColumnToggles(owner, holdOpen, releaseWhenSettled))
        {
            submenu.Items.Add(toggle);
        }

        return submenu;
    }

    /// <summary>
    /// One toggle per declared column, hidden ones included, ready to be put either straight into a
    /// menu or into a submenu.
    /// </summary>
    /// <remarks>
    /// The single place columns are listed. Both menus call it, so neither can drift from the other
    /// about which columns are offered, which are checked, or which may be turned off, and there is
    /// only one of them to maintain.
    /// <para>
    /// Because the menu now survives a toggle, the items are brought up to date after each one
    /// rather than merely being correct when built: turning a column off can leave some other
    /// column as the last visible one, and its toggle has to disable itself at that moment.
    /// </para>
    /// </remarks>
    private static List<MenuFlyoutItemBase> ColumnToggles(
        TableView owner, Action holdOpen, Action releaseWhenSettled)
    {
        List<MenuFlyoutItemBase> items = new();
        List<(ToggleMenuFlyoutItem Toggle, ResolvedColumn Column)> toggles = new();

        void Refresh()
        {
            foreach ((ToggleMenuFlyoutItem toggle, ResolvedColumn column) in toggles)
            {
                // Read back rather than assumed: SetColumnVisibility refuses a hide that would
                // leave nothing visible, and the toggle has already flipped itself by then.
                toggle.IsChecked = column.IsVisible;
                toggle.IsEnabled = !column.IsVisible || owner.CanHideColumn(column);
            }
        }

        foreach (ResolvedColumn column in owner.Layout.Order)
        {
            // No icon. In a list of on/off states the checkmark is the glyph being read, and a
            // second one beside it only competes with it.
            ToggleMenuFlyoutItem toggle = new() { Text = column.Column.DisplayName };
            ResolvedColumn target = column;

            toggle.Click += (_, _) =>
            {
                holdOpen();
                owner.SetColumnVisibility(target, toggle.IsChecked);
                Refresh();
                releaseWhenSettled();
            };

            toggles.Add((toggle, column));
            items.Add(toggle);
        }

        Refresh();
        return items;
    }

    private static MenuFlyoutItem FitVisibleColumns(TableView owner, IconElement? icon) => Command(
        TableResources.FitVisibleColumns,
        icon,
        owner.CanFitVisibleColumns,
        owner.AutoFitVisibleColumns);

    /// <param name="icon">
    /// The control's own, from <see cref="TableIcons"/>, in a menu of commands — where every item
    /// carries one, because a menu with icons on some items and not others reads as though the rest
    /// were missing theirs. Null in the column list, which is a menu of states and shows checks.
    /// </param>
    private static MenuFlyoutItem Command(string text, IconElement? icon, bool enabled, Action invoke)
    {
        MenuFlyoutItem item = new() { Text = text, Icon = icon, IsEnabled = enabled };
        item.Click += (_, _) => invoke();
        return item;
    }
}
