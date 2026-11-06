(function () {
  var scriptTag = document.currentScript;
  var widgetKey = scriptTag && scriptTag.getAttribute("data-widget-key");
  var apiBase = (scriptTag && scriptTag.getAttribute("data-api-base")) || new URL(scriptTag.src).origin;
  var primaryColor = (scriptTag && scriptTag.getAttribute("data-color")) || "#0f172a";
  var greeting = (scriptTag && scriptTag.getAttribute("data-greeting")) || "Size nasıl yardımcı olabiliriz?";

  if (!widgetKey) {
    console.error("FlowSales widget: data-widget-key attribute is required.");
    return;
  }

  var style = document.createElement("style");
  style.textContent =
    "#fs-widget-bubble{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:" +
    primaryColor +
    ";box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;z-index:999999;display:flex;align-items:center;justify-content:center;transition:transform .15s}" +
    "#fs-widget-bubble:hover{transform:scale(1.06)}" +
    "#fs-widget-bubble svg{width:28px;height:28px;fill:#fff}" +
    "#fs-widget-panel{position:fixed;bottom:92px;right:20px;width:320px;max-width:calc(100vw - 40px);background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.2);z-index:999999;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;display:none}" +
    "#fs-widget-panel.open{display:block}" +
    "#fs-widget-head{background:" +
    primaryColor +
    ";color:#fff;padding:16px;font-size:15px;font-weight:600}" +
    "#fs-widget-body{padding:16px;display:flex;flex-direction:column;gap:10px}" +
    "#fs-widget-body input,#fs-widget-body textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:inherit}" +
    "#fs-widget-body textarea{resize:vertical;min-height:60px}" +
    "#fs-widget-submit{background:" +
    primaryColor +
    ";color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:600;cursor:pointer}" +
    "#fs-widget-submit:disabled{opacity:.6;cursor:not-allowed}" +
    "#fs-widget-note{font-size:12px;color:#64748b;margin:0}" +
    "#fs-widget-success{padding:24px 16px;text-align:center;font-size:14px;color:#0f172a}" +
    "#fs-widget-website{position:absolute;left:-9999px}";
  document.head.appendChild(style);

  var bubble = document.createElement("div");
  bubble.id = "fs-widget-bubble";
  bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';

  var panel = document.createElement("div");
  panel.id = "fs-widget-panel";
  panel.innerHTML =
    '<div id="fs-widget-head">' + greeting + "</div>" +
    '<div id="fs-widget-body">' +
    '<input type="text" id="fs-w-name" placeholder="Ad Soyad *" />' +
    '<input type="text" id="fs-w-phone" placeholder="Telefon" />' +
    '<input type="email" id="fs-w-email" placeholder="E-posta" />' +
    '<textarea id="fs-w-message" placeholder="Mesajınız"></textarea>' +
    '<input type="text" id="fs-widget-website" autocomplete="off" tabindex="-1" />' +
    '<button id="fs-widget-submit">Gönder</button>' +
    '<p id="fs-widget-note">Bilgileriniz satış ekibimize iletilecektir.</p>' +
    "</div>";

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  bubble.addEventListener("click", function () {
    panel.classList.toggle("open");
  });

  document.getElementById("fs-widget-submit").addEventListener("click", function () {
    var name = document.getElementById("fs-w-name").value.trim();
    var phone = document.getElementById("fs-w-phone").value.trim();
    var email = document.getElementById("fs-w-email").value.trim();
    var message = document.getElementById("fs-w-message").value.trim();
    var honeypot = document.getElementById("fs-widget-website").value.trim();

    if (!name || (!phone && !email)) {
      alert("Lütfen adınızı ve telefon veya e-posta bilgilerinizden birini girin.");
      return;
    }

    var submitBtn = document.getElementById("fs-widget-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Gönderiliyor...";

    fetch(apiBase + "/api/public/widget-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgetKey: widgetKey, name: name, phone: phone, email: email, message: message, website: honeypot }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("request_failed");
        document.getElementById("fs-widget-body").innerHTML =
          '<div id="fs-widget-success">Teşekkürler! En kısa sürede size dönüş yapacağız.</div>';
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Gönder";
        alert("Mesajınız gönderilemedi, lütfen tekrar deneyin.");
      });
  });
})();
