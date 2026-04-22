import { useState } from "react";

interface Props {
  onSubmit: (mrUrl: string) => void;
  loading: boolean;
}

export function ReviewForm({ onSubmit, loading }: Props) {
  const [mrUrl, setMrUrl] = useState("");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !loading && mrUrl.trim()) {
      onSubmit(mrUrl.trim());
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="text"
        placeholder="输入 GitLab MR URL，例如 https://gitlab.com/group/project/-/merge_requests/1"
        value={mrUrl}
        onChange={(e) => setMrUrl(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
        style={{
          flex: 1,
          padding: "10px 14px",
          fontSize: 14,
          border: "1px solid #d0d7de",
          borderRadius: 6,
          outline: "none",
        }}
      />
      <button
        onClick={() => onSubmit(mrUrl.trim())}
        disabled={loading || !mrUrl.trim()}
        style={{
          padding: "10px 20px",
          fontSize: 14,
          backgroundColor: loading ? "#9ca3af" : "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "评审中..." : "开始评审"}
      </button>
    </div>
  );
}
