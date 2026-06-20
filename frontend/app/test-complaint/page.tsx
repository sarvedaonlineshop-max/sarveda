"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string | undefined;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement | null,
            options: { theme: string; size: string }
          ) => void;
        };
      };
    };
  }
}

export default function TestComplaintPage() {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [files, setFiles] = useState<FileList | null>(null);
  const [result, setResult] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!window.google?.accounts?.id) return;
      clearInterval(interval);
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: (response) => {
          setIdToken(response.credential);
          const payload = JSON.parse(atob(response.credential.split(".")[1] ?? "")) as {
            email?: string;
          };
          setUserEmail(payload.email ?? null);
        }
      });
      window.google.accounts.id.renderButton(document.getElementById("google-signin-btn"), {
        theme: "outline",
        size: "large"
      });
    }, 300);
    return () => clearInterval(interval);
  }, []);

  async function handleSubmit() {
    if (!idToken || !title.trim()) {
      alert("Sign in and enter a title first");
      return;
    }
    setSubmitting(true);
    setResult("");
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("priority", priority);
      if (files) {
        Array.from(files).forEach((f) => formData.append("files", f));
      }

      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData
      });
      const data = await res.json();
      setResult(`${res.status} ${res.statusText}\n\n${JSON.stringify(data, null, 2)}`);
    } catch (err) {
      setResult(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <div
        style={{
          maxWidth: "500px",
          margin: "40px auto",
          padding: "20px",
          fontFamily: "sans-serif"
        }}
      >
        <h1>🧪 Complaint API Test Page</h1>
        <p style={{ color: "#888", fontSize: "13px" }}>
          Temporary page to test backend before mobile app is built. Delete this page before production
          launch.
        </p>

        {!idToken ? (
          <div id="google-signin-btn" style={{ marginTop: "20px" }} />
        ) : (
          <div style={{ marginTop: "20px" }}>
            <p style={{ color: "green" }}>✅ Signed in as: {userEmail}</p>

            <input
              placeholder="Complaint title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%", padding: "8px", marginTop: "10px", boxSizing: "border-box" }}
            />
            <textarea
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: "8px", marginTop: "10px", boxSizing: "border-box" }}
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              style={{ width: "100%", padding: "8px", marginTop: "10px" }}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            <input
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              onChange={(e) => setFiles(e.target.files)}
              style={{ marginTop: "10px", width: "100%" }}
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              style={{
                marginTop: "16px",
                padding: "10px 20px",
                background: "#1e3a2f",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                width: "100%"
              }}
            >
              {submitting ? "Submitting..." : "Submit Test Complaint"}
            </button>

            {result ? (
              <pre
                style={{
                  marginTop: "16px",
                  background: "#f4f4f4",
                  padding: "12px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  overflow: "auto",
                  maxHeight: "300px"
                }}
              >
                {result}
              </pre>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
