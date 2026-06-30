import { supabase } from "./supabase/client.js";

const loginButtons = document.querySelectorAll(".auth-login-button");
const logoutButtons = document.querySelectorAll(".auth-logout-button");
const voucherLinks = document.querySelectorAll(".auth-vouchers-link");

function updateHeaderAuth(session) {
  const isLoggedIn = Boolean(session);

  loginButtons.forEach((button) => {
    button.hidden = isLoggedIn;
  });

  logoutButtons.forEach((button) => {
    button.hidden = !isLoggedIn;
  });

  voucherLinks.forEach((link) => {
    link.hidden = !isLoggedIn;
  });
}

async function loginWithGoogle() {
  if (!supabase) return;

  sessionStorage.setItem("trilha-return-tab", "inscricao");

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  });

  if (error) console.error(error);
}

async function logoutFromGoogle() {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) console.error(error);
}

loginButtons.forEach((button) => {
  button.addEventListener("click", loginWithGoogle);
});

logoutButtons.forEach((button) => {
  button.addEventListener("click", logoutFromGoogle);
});

if (supabase) {
  const { data, error } = await supabase.auth.getSession();
  if (error) console.error(error);

  updateHeaderAuth(data?.session || null);
  supabase.auth.onAuthStateChange((_event, session) => updateHeaderAuth(session));
} else {
  updateHeaderAuth(null);
}

window.appServices = {
  supabase,
};
