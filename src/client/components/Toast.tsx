import { useState, useCallback, useRef, createContext, useContext, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Toast {
  id: number;
  message: string;
  type: "error" | "success" | "warning";
}

interface ToastContextValue {
  toast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const toast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Fixed position toast container */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className={`rounded-lg shadow-lg p-3 flex items-start gap-2 text-sm ${
                t.type === "error"
                  ? "bg-red-900/90 border border-red-700/50 text-red-200"
                  : t.type === "warning"
                    ? "bg-amber-900/90 border border-amber-700/50 text-amber-200"
                    : "bg-emerald-900/90 border border-emerald-700/50 text-emerald-200"
              }`}
            >
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="text-current opacity-50 hover:opacity-100 shrink-0"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
