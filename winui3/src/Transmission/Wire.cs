using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace Transmission;

/// <summary>
/// The one owner of the wire: key names, method names, and the JSON-RPC 2.0 envelope.
/// Only the 4.1+ dialect is spoken, so there is one options object and no dialect switch.
/// </summary>
internal static class Wire
{
    private const string ProtocolVersion = "2.0";

    internal static readonly JsonSerializerOptions Options = Build();

    private static readonly ConcurrentDictionary<Type, string> MethodNames = new();
    private static readonly ConcurrentDictionary<Type, string[]> FieldNames = new();

    /// <summary>
    /// The method a request type names. All 24 are the plain snake case of the type name, so
    /// there is no table to maintain and no entry to get wrong.
    /// </summary>
    internal static string MethodOf(Type request) => MethodNames.GetOrAdd(
        request,
        static type =>
        {
            var name = type.Name;
            var arity = name.IndexOf('`');
            return JsonNamingPolicy.SnakeCaseLower.ConvertName(arity < 0 ? name : name[..arity]);
        });

    /// <summary>
    /// The wire names of a projection type's properties, which is what its request must ask for.
    /// Read from the projection's own <see cref="JsonTypeInfo"/>, so the two cannot disagree.
    /// </summary>
    internal static string[] FieldsOf(Type projection) => FieldNames.GetOrAdd(
        projection,
        static type => Options.GetTypeInfo(type).Properties.Select(property => property.Name).ToArray());

    internal static void WriteRequest(Utf8JsonWriter writer, IRpcRequest request, int id)
    {
        writer.WriteStartObject();
        writer.WriteString("jsonrpc", ProtocolVersion);
        writer.WriteString("method", MethodOf(request.GetType()));
        writer.WritePropertyName("params");
        JsonSerializer.Serialize(writer, request, request.GetType(), Options);
        writer.WriteNumber("id", id);
        writer.WriteEndObject();
    }

    private static JsonSerializerOptions Build()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,

            // Optional arguments are nullable properties and default-valued structs; this is what
            // makes them optional. It is also what lets TorrentIds.All be the default value and
            // vanish from the request, which is how the daemon spells "every torrent".
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingDefault,

            // The only converter registered globally, because it applies to every bool. The rest
            // belong to one type each and are declared on it.
            Converters = { new BoolConverter() },
            TypeInfoResolver = new DefaultJsonTypeInfoResolver { Modifiers = { AddFields } },
        };

        return options;
    }

    /// <summary>
    /// Gives every <see cref="IFieldRequest{T}"/> a synthetic <c>fields</c> argument taken from
    /// the projection type it declares, so a request asks for exactly the properties its response
    /// deserializes into and drift is unrepresentable.
    /// </summary>
    private static void AddFields(JsonTypeInfo info)
    {
        if (info.Kind != JsonTypeInfoKind.Object)
        {
            return;
        }

        var declaration = Array.Find(
            info.Type.GetInterfaces(),
            candidate => candidate.IsGenericType && candidate.GetGenericTypeDefinition() == typeof(IFieldRequest<>));

        if (declaration is null)
        {
            return;
        }

        var projection = declaration.GetGenericArguments()[0];
        var fields = info.CreateJsonPropertyInfo(typeof(string[]), "fields");
        fields.Get = _ => FieldsOf(projection);
        info.Properties.Add(fields);
    }
}

/// <summary>
/// Transmission 4.0 wrote <c>file_stats[].wanted</c> as 0 or 1 and 4.1 writes true or false.
/// Reading both here means no property has to know which daemon answered.
/// </summary>
internal sealed class BoolConverter : JsonConverter<bool>
{
    public override bool Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) => reader.TokenType switch
    {
        JsonTokenType.True => true,
        JsonTokenType.False => false,
        JsonTokenType.Number => reader.GetInt64() != 0L,
        _ => throw new JsonException($"Expected a boolean, read {reader.TokenType}."),
    };

    public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options) =>
        writer.WriteBooleanValue(value);
}
