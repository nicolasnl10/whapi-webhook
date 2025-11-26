export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { from, message, timestamp } = req.body || {};

    const raw = message || "";
    const valorMatch = raw.match(/([0-9]+[.,]?[0-9]*)/);
    const valor = valorMatch ? parseFloat(valorMatch[1].replace(",", ".")) : null;

    let type = "gasto";
    if (/recebi|receita|salario|salário|deposito|depósito|transferencia/i.test(raw)) {
      type = "receita";
    }

    let category = "outros";
    const catMatch = raw.match(
      /(mercado|uber|combustivel|combustível|aluguel|luz|agua|água|internet|restaurante|farmacia|farmácia|lazer)/i
    );
    if (catMatch) category = catMatch[1].toLowerCase();

    const row = {
      date: timestamp || new Date().toISOString(),
      type,
      category,
      value: valor || "",
      description: raw,
      origin_phone: from || "",
      message_raw: raw,
    };

    console.log("Received row:", row);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "internal" });
  }
}
