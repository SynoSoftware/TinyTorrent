namespace TinyTorrent_Ui;

internal sealed record Settings
{
    public string? DownloadDir { get; set; }
    public string? IncompleteDir { get; set; }
    public bool? IncompleteDirEnabled { get; set; }
    public bool? RenamePartialFiles { get; set; }
    public bool? StartAddedTorrents { get; set; }
    public bool? TrashOriginalTorrentFiles { get; set; }
    public int? PeerPort { get; set; }
    public bool? PeerPortRandomOnStart { get; set; }
    public bool? PortForwardingEnabled { get; set; }
    public string? Encryption { get; set; }
    public bool? PexEnabled { get; set; }
    public bool? DhtEnabled { get; set; }
    public bool? LpdEnabled { get; set; }
    public int? SpeedLimitDown { get; set; }
    public bool? SpeedLimitDownEnabled { get; set; }
    public int? SpeedLimitUp { get; set; }
    public bool? SpeedLimitUpEnabled { get; set; }
    public int? AltSpeedDown { get; set; }
    public int? AltSpeedUp { get; set; }
    public bool? AltSpeedEnabled { get; set; }
    public bool? AltSpeedTimeEnabled { get; set; }
    public int? AltSpeedTimeBegin { get; set; }
    public int? AltSpeedTimeEnd { get; set; }
    public int? AltSpeedTimeDay { get; set; }
    public int? PeerLimitGlobal { get; set; }
    public int? PeerLimitPerTorrent { get; set; }
    public bool? DownloadQueueEnabled { get; set; }
    public int? DownloadQueueSize { get; set; }
    public bool? SeedQueueEnabled { get; set; }
    public int? SeedQueueSize { get; set; }
    public bool? QueueStalledEnabled { get; set; }
    public int? QueueStalledMinutes { get; set; }
    public double? SeedRatioLimit { get; set; }
    public bool? SeedRatioLimited { get; set; }
    public int? IdleSeedingLimit { get; set; }
    public bool? IdleSeedingLimitEnabled { get; set; }
    public bool? BlocklistEnabled { get; set; }
    public string? BlocklistUrl { get; set; }
    public bool? SequentialDownload { get; set; }
}

internal sealed record BlocklistFacts(int BlocklistSize);
