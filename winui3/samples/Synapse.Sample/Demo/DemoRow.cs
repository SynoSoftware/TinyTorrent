namespace Synapse_Sample;

/// <summary>One generated row for the first-light demo. Static data: no change notification.</summary>
public sealed class DemoRow
{
    public required int Index { get; init; }

    public required string Name { get; init; }

    public required string SizeText { get; init; }

    public required string AddedText { get; init; }

    public required double Progress { get; init; }

    public required string ProgressText { get; init; }

    public static List<DemoRow> Generate(int count)
    {
        string[] words =
        {
            "ubuntu", "debian", "fedora", "arch", "alpine", "gentoo", "manjaro", "mint",
            "slackware", "void", "nixos", "kali", "rocky", "alma", "suse",
        };
        string[] kinds = { "desktop", "server", "netinst", "live", "minimal" };

        DateTimeOffset start = new(2024, 1, 1, 8, 0, 0, TimeSpan.Zero);
        List<DemoRow> rows = new(count);

        for (int i = 0; i < count; i++)
        {
            double gb = 0.4 + ((i * 37) % 190) / 10.0;
            double progress = (i * 13) % 101;

            rows.Add(new DemoRow
            {
                Index = i,
                Name = $"{words[i % words.Length]}-{24 + (i % 3)}.{i % 10}-{kinds[i % kinds.Length]}-amd64.iso",
                SizeText = $"{gb:0.0} GB",
                AddedText = start.AddHours(i * 7).ToString("yyyy-MM-dd HH:mm"),
                Progress = progress,
                ProgressText = $"{progress:0}%",
            });
        }

        return rows;
    }
}
