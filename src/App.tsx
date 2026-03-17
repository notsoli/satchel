import { useState, useEffect } from "react";
import Viewer from "./components/Viewer";
import Editor from "./components/Editor";

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return path;
}

function App() {
  const path = useRoute();
  if (path === "/view") return <Viewer />;
  else if (path === "/") return <Editor />;
  else
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2rem",
        }}
      >
        <h1>satchel</h1>
        <p>
          you lost your way! edit <a href="/">here</a> and view{" "}
          <a href="/view">here</a>
        </p>
      </div>
    );
}

export default App;
