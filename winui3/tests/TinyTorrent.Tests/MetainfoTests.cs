using System.Text;
using TinyTorrent_Ui;

namespace TinyTorrent_Tests;

[TestClass]
public sealed class MetainfoTests
{
    [TestMethod]
    [DataRow("?xt=urn:btih:0123456789abcdef0123456789abcdef01234567", true)]
    [DataRow("?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567", true)]
    [DataRow("?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", true)]
    [DataRow("?xt=urn:btih:abcdefghijklmnopqrstuvwxyz234567", true)]
    [DataRow("?xt=urn:btih:", false)]
    [DataRow("?xt=urn:btih:example", false)]
    [DataRow("?xt=urn:btih:0123456789abcdef0123456789abcdef0123456g", false)]
    [DataRow("?xt=urn:btih:0123456789abcdef0123456789abcdef012345678", false)]
    [DataRow("?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234560", false)]
    [DataRow("?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234568", false)]
    [DataRow("?dn=0123456789abcdef0123456789abcdef01234567", false)]
    [DataRow("?xt=urn:btih:garbage&xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", true)]
    [DataRow("?xt=urn:btmh:1220garbage&xt=urn:btih:0123456789abcdef0123456789abcdef01234567", true)]
    public void MagnetRequiresASupportedV1Hash(string query, bool valid) => Assert.AreEqual(valid, Metainfo.HasMagnetHash(query));

    [TestMethod]
    public void SingleFileKeepsItsNameAndLength()
    {
        var files = Read("6:lengthi3e4:name5:a.bin");
        Assert.HasCount(1, files);
        Assert.AreEqual("a.bin", files[0].Name);
        Assert.AreEqual(3L, files[0].Length);
    }

    [TestMethod]
    public void FileOrderMatchesTheMetainfoIncludingPaddingFiles()
    {
        var files = Read("5:filesld6:lengthi2e4:pathl5:b.txteed6:lengthi1e4:pathl4:.pad1:1eee4:name4:root");
        CollectionAssert.AreEqual(new[] { "root/b.txt", "root/.pad/1" }, files.Select(file => file.Name).ToArray());
        CollectionAssert.AreEqual(new[] { 2L, 1L }, files.Select(file => file.Length).ToArray());
    }

    [TestMethod]
    public void Utf8NameAndPathOverrideLegacyNames()
    {
        var files = Read("5:filesld6:lengthi3e4:pathl3:olde10:path.utf-8l3:neweee4:name3:old10:name.utf-83:new");
        Assert.AreEqual("new/new", files[0].Name);
    }

    [TestMethod]
    [DataRow("6:lengthi-1e4:name1:x")]
    [DataRow("6:lengthi5e4:name1:x")]
    [DataRow("6:lengthi03e4:name1:x")]
    [DataRow("6:lengthi3e4:name2:..")]
    [DataRow("5:filesle4:name1:x")]
    [DataRow("5:filesld6:lengthi3e4:pathleee4:name1:x")]
    [DataRow("5:filesld6:lengthi3e4:pathl2:..eee4:name1:x")]
    [DataRow("5:filesld6:lengthi3e4:pathl3:a/beee4:name1:x")]
    [DataRow("5:filesld6:lengthi1e4:pathl1:aeed6:lengthi2e4:pathl1:aeee4:name1:x")]
    [DataRow("5:filesld6:lengthi3e4:pathl1:aeee6:lengthi3e4:name1:x")]
    public void InvalidFileMetadataCannotBecomeAnAddPreview(string fields)
    {
        Assert.ThrowsExactly<FormatException>(() => Read(fields));
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("d4:info")]
    [DataRow("d4:infode4:infodee")]
    [DataRow("99999999999999999999999999999:x")]
    [DataRow("d4:infod6:lengthi3e4:name1:x6:pieces0:12:piece lengthi0eee")]
    public void MalformedBencodeIsReportedAsAFormatError(string text)
    {
        Assert.ThrowsExactly<FormatException>(() => Metainfo.Read(Encoding.UTF8.GetBytes(text)));
    }

    [TestMethod]
    public void TrailingBytesAreRejected()
    {
        Assert.ThrowsExactly<FormatException>(() => Metainfo.Read(Encoding.UTF8.GetBytes(Torrent("6:lengthi3e4:name1:x") + "e")));
    }

    [TestMethod]
    public void UnsupportedV2MetadataIsExplained()
    {
        var exception = Assert.ThrowsExactly<FormatException>(() => Metainfo.Read(
            Encoding.UTF8.GetBytes("d4:infod9:file treede12:meta versioni2e4:name1:xee")));
        StringAssert.Contains(exception.Message, "BitTorrent v2");
    }

    [TestMethod]
    public void NestedUnknownFieldsRespectTheEnginesDepthLimit()
    {
        var text = "d7:ignored" + new string('l', 33) + new string('e', 33) + "e";
        Assert.ThrowsExactly<FormatException>(() => Metainfo.Read(Encoding.UTF8.GetBytes(text)));
    }

    private static IReadOnlyList<MetainfoFile> Read(string fields) => Metainfo.Read(Encoding.UTF8.GetBytes(Torrent(fields)));

    private static string Torrent(string fields) =>
        "d4:infod" + fields + "12:piece lengthi4e6:pieces20:....................ee";
}
