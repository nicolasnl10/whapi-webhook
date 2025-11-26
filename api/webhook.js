// /api/webhook.js
export default async function handler(req, res) {
  try {
    // Aceita apenas POSTs (Whapi envia POST)
    if (req.method !== "POST") {
      return res.status(200).json({ status: "ok", message: "Webhook active" });
    }

    const body = req.body || {};
    // Ajuste conforme o formato do Whapi (algumas variações existem)
    // Exemplos de payloads: { from: "+55...", message: "gastei 25 no mercado", timestamp: "..." }
    // ou { messages: [{ from: "+55...", text: "gastei 25 no mercado" }]}
    const rawMessage =
      body.message ||
      (body.messages && body.messages[0] && (body.messages[0].text || body.messages[0].body)) ||
      body.text ||
      "";

    const from =
      body.from ||
      (body.messages && body.messages[0] && (body.messages[0].from || body.messages[0].sender)) ||
      (body.author || "");

    const timestamp = body.timestamp || new Date().toISOString();

    if (!rawMessage) {
      console.log("No message text found in incoming payload:", JSON.stringify(body));
      return res.status(200).json({ status: "ignored", reason: "no_text" });
    }

    const text = String(rawMessage).trim();

    // --- PARSER SIMPLES (regex) ---
    // tenta capturar valor e tipo (gasto/receita)
    const numberMatch = text.match(/([0-9]+[.,]?[0-9]*)/);
    const rawValue = numberMatch ? numberMatch[1].replace(",", ".") : null;
    const amount = rawValue ? parseFloat(rawValue) : null;

    let type = "expense";
    if (/recebi|recebido|receita|salario|salário|entrada|ganhei|ganho/i.test(text)) {
      type = "income";
    }

    // categoria simples por palavras-chaves
    let category = "others";
    const catMatch = text.match(/(mercado|lanche|uber|combustivel|combustível|aluguel|luz|água|agua|internet|restaurante|farmacia|farmácia|transporte|saude|saúde|educacao|educação|salario|salário)/i);
    if (catMatch) category = catMatch[1].toLowerCase();

    // descrição: a frase inteira (removendo número no fim se quiser)
    const description = text;

    // Monta objeto para salvar
    const payload = {
      // campos esperados pela sua tabela transactions no Lovable/Supabase
      user_id: null, // se quiser mapear por telefone: podemos implementar depois
      amount: amount || 0,
      type: type === "income" ? "income" : "expense",
      date: timestamp.split("T")[0],
      category,
      description,
      source: "whatsapp",
      raw_message: text,
    };

    console.log("Parsed payload:", payload);

    // --- SALVAR NO LOVABLE (ou Supabase) ---
    const LOVABLE_URL = process.env.LOVABLE_URL; // ex: https://your-project.lovable.app
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY; // Bearer key

    if (!LOVABLE_URL || !LOVABLE_API_KEY) {
      console.warn("Lovable credentials missing. Skipping save.");
    } else {
      // Endpoint genérico que vimos antes: /rest/tables/transactions/rows
      const insertRes = await fetch(`${LOVABLE_URL.replace(/\/$/, "")}/rest/tables/transactions/rows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!insertRes.ok) {
        const errText = await insertRes.text();
        console.error("Lovable save error:", insertRes.status, errText);
      } else {
        console.log("Saved to Lovable (OK).");
      }
    }

    // --- RESPONDER NO WHATSAPP VIA WHAPI (opcional) ---
    const WHAPI_SEND_URL = process.env.WHAPI_SEND_URL; // ex: https://gate.whapi.cloud/messages/text OR provider endpoint
    const WHAPI_TOKEN = process.env.WHAPI_TOKEN;

    if (WHAPI_SEND_URL && WHAPI_TOKEN) {
      try {
        const replyText = amount
          ? `Anotado ✅ ${type === "income" ? "Receita" : "Gasto"} de R$${amount.toFixed(2)} (${category}).`
          : `Anotado ✅ Mensagem: "${text}"`;

        // Estrutura genérica: { to: "+55...", body: "texto" } — ajuste conforme seu provider
        await fetch(WHAPI_SEND_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${WHAPI_TOKEN}`
          },
          body: JSON.stringify({
            to: from,
            body: replyText
          })
        });

        console.log("Reply sent to WhatsApp.");
      } catch (err) {
        console.error("Error sending WhatsApp reply:", err);
      }
    } else {
      console.log("WHAPI credentials missing, skipping WhatsApp reply.");
    }

    return res.status(200).json({ status: "ok", saved: !!LOVABLE_URL });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: "internal" });
  }
}
