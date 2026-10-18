// Asks the key which models it can actually use, then tries the likely ones.
const fs = require("fs");
const key = fs.readFileSync(0, "utf8").trim();
const H = { "x-goog-api-key": key };

async function listModels(ver) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?pageSize=200`, { headers: H });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      return { err: `${r.status} ${((j && j.error) || {}).status || ""}` };
    }
    const j = await r.json();
    return { models: (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")) };
  } catch (e) { return { err: e.message }; }
}

const img = fs.readFileSync("C:/ai/newcard/qr-ypainewcard.png").toString("base64");
const body = JSON.stringify({
  contents: [{ role: "user", parts: [
    { text: 'Reply with the JSON {"ok":true}.' },
    { inlineData: { mimeType: "image/png", data: img } },
  ]}],
  generationConfig: { responseMimeType: "application/json", maxOutputTokens: 256, temperature: 0 },
});

async function tryGen(ver, model) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", ...H }, body });
    if (r.ok) return "✅ 200 OK";
    const j = await r.json().catch(() => null);
    const e = (j && j.error) || {};
    return `❌ ${r.status} ${e.status || ""} — ${(e.message || "").slice(0, 120)}`;
  } catch (e) { return "❌ " + e.message; }
}

(async () => {
  console.log("키 길이:", key.length, "앞6:", key.slice(0, 6), "\n");
  for (const ver of ["v1beta", "v1"]) {
    const res = await listModels(ver);
    console.log(`=== ${ver} 사용 가능 모델 ===`);
    if (res.err) { console.log("  조회 실패:", res.err, "\n"); continue; }
    const names = res.models.map((m) => m.name.replace(/^models\//, ""));
    console.log(" ", names.length ? names.join("\n  ") : "(없음)");
    const flash = names.filter((n) => /flash/.test(n)).slice(0, 6);
    console.log(`\n  --- ${ver} flash 계열 실제 호출 ---`);
    for (const m of flash) console.log("  " + m.padEnd(34), await tryGen(ver, m));
    console.log();
  }
})();
