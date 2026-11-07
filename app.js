const $ = (id) => document.getElementById(id);
let mode = "login";
$("year").textContent = new Date().getFullYear();

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  mode = btn.dataset.mode;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
  $("nameLabel").classList.toggle("hidden", mode !== "register");
  $("name").required = mode === "register";
  $("password").autocomplete = mode === "register" ? "new-password" : "current-password";
  $("submitAuth").textContent = mode === "register" ? "إنشاء الحساب" : "تسجيل الدخول";
  $("authMessage").textContent = "";
}));

async function api(url, data) {
  const res = await fetch(url, {
    method: data ? "POST" : "GET",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "حدث خطأ.");
  return result;
}

async function showFeed(user) {
  $("auth").classList.add("hidden");
  $("feed").classList.remove("hidden");
  $("displayName").textContent = user.display_name;
  await loadPosts();
}
function showAuth() {
  $("feed").classList.add("hidden");
  $("auth").classList.remove("hidden");
}
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("authMessage").textContent = "جارٍ المعالجة...";
  const data = { email: $("email").value, password: $("password").value };
  if (mode === "register") data.name = $("name").value;
  try {
    await api(mode === "register" ? "/api/register" : "/api/login", data);
    const result = await api("/api/me");
    $("password").value = "";
    await showFeed(result.user);
  } catch (err) { $("authMessage").textContent = err.message; }
});
$("logout").addEventListener("click", async () => {
  await api("/api/logout", {});
  showAuth();
});
async function loadPosts() {
  const { posts } = await api("/api/posts");
  $("posts").replaceChildren();
  posts.forEach(post => {
    const card = document.createElement("article");
    card.className = "panel";
    const name = document.createElement("strong");
    name.textContent = post.display_name;
    const date = document.createElement("small");
    date.textContent = " · " + post.created_at;
    const body = document.createElement("p");
    body.className = "post";
    body.textContent = post.body;
    card.append(name, date, body);
    $("posts").append(card);
  });
}
$("postForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/posts", { body: $("postBody").value });
    $("postBody").value = "";
    $("postMessage").textContent = "تم نشر منشورك.";
    await loadPosts();
  } catch (err) { $("postMessage").textContent = err.message; }
});
(async () => {
  try {
    const { user } = await api("/api/me");
    if (user) await showFeed(user);
  } catch (_) {}
})();