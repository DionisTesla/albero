const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// === КОНФИГ ===
const API_KEY = "ВАШ-API-КЛЮЧ";
const CRM_URL = "https://СВОЙ-URL.retailcrm.ru";
const LOYALTY_ID = 4;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// === Форматирование телефона в E.164 ===
function formatPhone(input) {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("8")) {
    return "+7" + digits.slice(1);
  } else if (digits.startsWith("7")) {
    return "+7" + digits.slice(1);
  } else if (digits.startsWith("9")) {
    return "+7" + digits;
  } else if (digits.startsWith("0")) {
    return "+7" + digits.slice(1);
  } else if (!digits.startsWith("+")) {
    return "+" + digits;
  }
  return digits;
}

// === Получение телефона по номеру ===
async function findCustomerByPhone(phone) {
  const query = new URLSearchParams({
    apiKey: API_KEY,
    phone: phone,
  });

  const res = await fetch(`${CRM_URL}/api/v5/customers?${query}`);
  const data = await res.json();

  if (!data.success || !data.customers || !data.customers.length) {
    console.log("❌ Клиент по номеру не найден");
    return null;
  }

  const customer = data.customers[0];
  console.log("✅ Клиент найден по номеру:", customer);
  return customer;
}

// === Создание клиента и регистрация в лояльности ===
app.post("/submit", async (req, res) => {
  const { name, email, phone } = req.body;
  const formattedPhone = formatPhone(phone);

  try {
    // 1. Создание клиента
    const createRes = await fetch(`${CRM_URL}/api/v5/customers/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        apiKey: API_KEY,
        customer: JSON.stringify({
          externalId: formattedPhone,
          firstName: name,
          email,
          phones: [{ number: formattedPhone }],
        }),
      }),
    });

    const createData = await createRes.json();
    console.log("CRM create response:", createData);

    if (!createData.success) {
      return res.status(500).send("❌ Ошибка при создании клиента.");
    }

    // 2. Поиск клиента по номеру
    console.log("⏳ Ищем клиента по номеру...");
    await new Promise((r) => setTimeout(r, 2000));
    const customer = await findCustomerByPhone(formattedPhone);

    if (!customer || !customer.externalId) {
      return res
        .status(500)
        .send("❌ Не удалось получить клиента для лояльности.");
    }

    // 3. Создание аккаунта в программе лояльности
    const loyaltyRes = await fetch(`${CRM_URL}/api/v5/loyalty/account/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        apiKey: API_KEY,
        loyaltyAccount: JSON.stringify({
          phone: formattedPhone,
          cardNumber: formattedPhone,
          loyalty: { id: LOYALTY_ID },
          customer: { externalId: formattedPhone },
        }),
      }),
    });

    const loyaltyData = await loyaltyRes.json();
    console.log("📦 Loyalty response:", loyaltyData);

    if (!loyaltyData.success) {
      return res.status(500).send("❌ Ошибка при добавлении в лояльность.");
    }

    res.send(
      "<h2>✅ Клиент успешно зарегистрирован в CRM и программе лояльности.</h2>"
    );
  } catch (err) {
    console.error("❌ Ошибка сервера:", err);
    res.status(500).send("❌ Внутренняя ошибка сервера.");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});
