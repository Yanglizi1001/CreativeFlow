using System.Globalization;
using System.Text.Json.Nodes;
namespace CreativeFlow.Host;
public sealed partial class IntegratedWorkspaceService
{
    private static readonly HashSet<string> OpinionMetadata=["createdAt","updatedAt","statusChangedAt","timeOrigin","inheritedFrom","sourceCreatedAt"];
    private static bool OpinionTime(JsonNode? value,out DateTimeOffset parsed) => DateTimeOffset.TryParse(value?.GetValue<string>(),CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out parsed);
    private static string ClientTime(JsonObject fields,string key,string fallback){return OpinionTime(fields[key],out var time)&&time<=DateTimeOffset.UtcNow.AddMinutes(5)?fields[key]!.GetValue<string>():fallback;}
    private static JsonObject StampOpinion(JsonObject fields,JsonObject? previous,JsonObject? changes=null)
    {
        var next=(JsonObject)fields.DeepClone();var now=DateTimeOffset.UtcNow.ToString("O");
        if(previous is null){
            if(next["timeOrigin"]?.GetValue<string>()!="legacy") {next["createdAt"]=ClientTime(next,"createdAt",now);next["updatedAt"]=ClientTime(next,"updatedAt",next["createdAt"]!.GetValue<string>());}
            return next;
        }
        if(!JsonNode.DeepEquals(previous["createdAt"],next["createdAt"]))throw new ArgumentException("意见创建时间不能修改");
        var contentChanged=!JsonNode.DeepEquals(previous["text"],next["text"])||(previous["time"]?.GetValue<string>()??"")!=(next["time"]?.GetValue<string>()??"");
        var statusChanged=!JsonNode.DeepEquals(previous["done"],next["done"])||!JsonNode.DeepEquals(previous["status"],next["status"]);
        if(contentChanged)next["updatedAt"]=changes?.ContainsKey("updatedAt")==true?ClientTime(changes,"updatedAt",now):now;else if(previous["updatedAt"] is null)next.Remove("updatedAt");else next["updatedAt"]=previous["updatedAt"]!.DeepClone();
        if(statusChanged)next["statusChangedAt"]=changes?.ContainsKey("statusChangedAt")==true?ClientTime(changes,"statusChangedAt",now):now;else if(previous["statusChangedAt"] is null)next.Remove("statusChangedAt");else next["statusChangedAt"]=previous["statusChangedAt"]!.DeepClone();
        return next;
    }
}
