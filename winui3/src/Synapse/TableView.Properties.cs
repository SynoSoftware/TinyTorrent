using System.Collections;
using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;

namespace Synapse;

public sealed partial class TableView
{
    public static readonly DependencyProperty ItemsSourceProperty =
        DependencyProperty.Register(
            nameof(ItemsSource),
            typeof(IEnumerable),
            typeof(TableView),
            new PropertyMetadata(null, OnItemsSourceChanged));

    public static readonly DependencyProperty IsLoadingProperty =
        DependencyProperty.Register(
            nameof(IsLoading),
            typeof(bool),
            typeof(TableView),
            new PropertyMetadata(false, OnStateInputChanged));

    public static readonly DependencyProperty EmptyStateProperty =
        DependencyProperty.Register(
            nameof(EmptyState),
            typeof(TableEmptyState),
            typeof(TableView),
            new PropertyMetadata(TableEmptyState.Empty, OnStateInputChanged));

    public static readonly DependencyProperty LoadingContentProperty =
        DependencyProperty.Register(
            nameof(LoadingContent),
            typeof(object),
            typeof(TableView),
            new PropertyMetadata(null, OnStateInputChanged));

    public static readonly DependencyProperty LoadingContentTemplateProperty =
        DependencyProperty.Register(
            nameof(LoadingContentTemplate),
            typeof(DataTemplate),
            typeof(TableView),
            new PropertyMetadata(null, OnStateInputChanged));

    public static readonly DependencyProperty EmptyContentProperty =
        DependencyProperty.Register(
            nameof(EmptyContent),
            typeof(object),
            typeof(TableView),
            new PropertyMetadata(null, OnStateInputChanged));

    public static readonly DependencyProperty EmptyContentTemplateProperty =
        DependencyProperty.Register(
            nameof(EmptyContentTemplate),
            typeof(DataTemplate),
            typeof(TableView),
            new PropertyMetadata(null, OnStateInputChanged));

    public static readonly DependencyProperty NoResultsContentProperty =
        DependencyProperty.Register(
            nameof(NoResultsContent),
            typeof(object),
            typeof(TableView),
            new PropertyMetadata(null, OnStateInputChanged));

    public static readonly DependencyProperty NoResultsContentTemplateProperty =
        DependencyProperty.Register(
            nameof(NoResultsContentTemplate),
            typeof(DataTemplate),
            typeof(TableView),
            new PropertyMetadata(null, OnStateInputChanged));

    /// <summary>The host's already filtered projection. The table never filters it further.</summary>
    public IEnumerable? ItemsSource
    {
        get => (IEnumerable?)GetValue(ItemsSourceProperty);
        set => SetValue(ItemsSourceProperty, value);
    }

    /// <summary>
    /// The immutable column baseline. Setup-only: the table captures it at its first
    /// <c>Loaded</c> and a structural change afterwards is a configuration error.
    /// </summary>
    public ObservableCollection<TableColumn> Columns { get; } = new();

    public bool IsLoading
    {
        get => (bool)GetValue(IsLoadingProperty);
        set => SetValue(IsLoadingProperty, value);
    }

    /// <summary>Which empty presentation applies. Only the host knows.</summary>
    public TableEmptyState EmptyState
    {
        get => (TableEmptyState)GetValue(EmptyStateProperty);
        set => SetValue(EmptyStateProperty, value);
    }

    public object? LoadingContent
    {
        get => GetValue(LoadingContentProperty);
        set => SetValue(LoadingContentProperty, value);
    }

    public DataTemplate? LoadingContentTemplate
    {
        get => (DataTemplate?)GetValue(LoadingContentTemplateProperty);
        set => SetValue(LoadingContentTemplateProperty, value);
    }

    public object? EmptyContent
    {
        get => GetValue(EmptyContentProperty);
        set => SetValue(EmptyContentProperty, value);
    }

    public DataTemplate? EmptyContentTemplate
    {
        get => (DataTemplate?)GetValue(EmptyContentTemplateProperty);
        set => SetValue(EmptyContentTemplateProperty, value);
    }

    public object? NoResultsContent
    {
        get => GetValue(NoResultsContentProperty);
        set => SetValue(NoResultsContentProperty, value);
    }

    public DataTemplate? NoResultsContentTemplate
    {
        get => (DataTemplate?)GetValue(NoResultsContentTemplateProperty);
        set => SetValue(NoResultsContentTemplateProperty, value);
    }

    private static void OnItemsSourceChanged(DependencyObject d, DependencyPropertyChangedEventArgs e) =>
        ((TableView)d).SetItemsSource(e.NewValue as IEnumerable);

    private static void OnStateInputChanged(DependencyObject d, DependencyPropertyChangedEventArgs e) =>
        ((TableView)d).UpdateStateLayer();
}
