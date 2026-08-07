import React, { useEffect, useState } from "react";
import { ToastProvider } from "./ui.jsx";
import Landing from "./pages/Landing.jsx";
import Auth from "./pages/Auth.jsx";
import Shell from "./pages/Shell.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import GenericList from "./pages/GenericList.jsx";
import Gallery from "./pages/Gallery.jsx";
import Chat from "./pages/Chat.jsx";
import Knowledge from "./pages/Knowledge.jsx";
import SearchPage from "./pages/Search.jsx";
import Feedback from "./pages/Feedback.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import Admin from "./pages/Admin.jsx";
import { getToken, clearTokens } from "./api.js";

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash || "#/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.slice(1) || "/";
}

function applyTheme() {
  const saved = localStorage.getItem("ca_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  return saved;
}

export default function App() {
  const [theme, setThemeState] = useState(applyTheme);
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const route = useHashRoute();

  const setTheme = (t) => {
    localStorage.setItem("ca_theme", t);
    document.documentElement.setAttribute("data-theme", t);
    setThemeState(t);
  };

  const logout = () => {
    clearTokens();
    setAuthed(false);
    window.location.hash = "#/";
  };

  if (authed) {
    if (route === "/" || route === "/login" || route === "/register") {
      window.location.hash = "#/app";
      return null;
    }
    const Page = () => {
      const path = route.split("?")[0];
      if (path === "/app") return <Dashboard />;
      if (path === "/chat") return <Chat />;
      if (path === "/gallery") return <Gallery />;
      if (path === "/knowledge") return <Knowledge />;
      if (path === "/search") return <SearchPage />;
      if (path === "/feedback") return <Feedback />;
      if (path === "/settings") return <SettingsPage />;
      if (path === "/admin") return <Admin />;
      if (path.startsWith("/students")) return <GenericList type="students" />;
      if (path.startsWith("/faculty")) return <GenericList type="faculty" />;
      if (path.startsWith("/departments")) return <GenericList type="departments" />;
      if (path.startsWith("/courses")) return <GenericList type="courses" />;
      if (path.startsWith("/notices")) return <GenericList type="notices" />;
      if (path.startsWith("/events")) return <GenericList type="events" />;
      if (path.startsWith("/placements")) return <GenericList type="placements" />;
      if (path.startsWith("/timetable")) return <GenericList type="timetable" />;
      return <Dashboard />;
    };
    return (
      <ToastProvider>
        <Shell route={route} theme={theme} setTheme={setTheme} logout={logout} userCache={{}}>
          <Page />
        </Shell>
      </ToastProvider>
    );
  }

  if (route === "/login" || route === "/register") {
    return (
      <ToastProvider>
        <Auth mode={route === "/login" ? "login" : "register"} onAuthed={() => setAuthed(true)} theme={theme} setTheme={setTheme} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <Landing theme={theme} setTheme={setTheme} />
    </ToastProvider>
  );
}
