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

        if (active is null)
        {
            menu.Items.Add(ColumnsSubmenu(owner));
            menu.Items.Add(FitVisibleColumns(owner));
            return menu;
        }

        menu.Items.Add(Command(
            TableResources.HideThisColumn,
            owner.CanHideColumn(active),
            () => owner.SetColumnVisibility(active, false)));
        menu.Items.Add(ColumnsSubmenu(owner));

        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Command(
            TableResources.FitThisColumn,
            owner.CanFitColumn(active),
            () => owner.AutoFitColumn(active.Id)));
        menu.Items.Add(FitVisibleColumns(owner));
        menu.Items.Add(Command(
            TableResources.NarrowThisColumn,
            owner.CanNudgeColumnWidth(active, -1),
            () => owner.NudgeColumnWidth(active, -1)));
        menu.Items.Add(Command(
            TableResources.WidenThisColumn,
            owner.CanNudgeColumnWidth(active, 1),
            () => owner.NudgeColumnWidth(active, 1)));

        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Command(
            TableResources.MoveLeft,
            owner.CanMoveColumnBy(active, -1),
            () => owner.MoveColumnBy(active, -1)));
        menu.Items.Add(Command(
            TableResources.MoveRight,
            owner.CanMoveColumnBy(active, 1),
            () => owner.MoveColumnBy(active, 1)));

        return menu;
    }

    /// <summary>
    /// One toggle per declared column, hidden ones included. The last visible column's toggle is
    /// disabled, so no sequence of toggles reaches a table with nothing visible.
    /// </summary>
    private static MenuFlyoutSubItem ColumnsSubmenu(TableView owner)
    {
        MenuFlyoutSubItem submenu = new() { Text = TableResources.Columns };

        foreach (ResolvedColumn column in owner.Layout.Order)
        {
            ToggleMenuFlyoutItem toggle = new()
            {
                Text = column.Column.DisplayName,
                IsChecked = column.IsVisible,
                IsEnabled = !column.IsVisible || owner.CanHideColumn(column),
            };

            toggle.Click += (_, _) => owner.SetColumnVisibility(column, toggle.IsChecked);
            submenu.Items.Add(toggle);
        }

        return submenu;
    }

    private static MenuFlyoutItem FitVisibleColumns(TableView owner) => Command(
        TableResources.FitVisibleColumns,
        owner.CanFitVisibleColumns,
        owner.AutoFitVisibleColumns);

    private static MenuFlyoutItem Command(string text, bool enabled, Action invoke)
    {
        MenuFlyoutItem item = new() { Text = text, IsEnabled = enabled };
        item.Click += (_, _) => invoke();
        return item;
    }
}
