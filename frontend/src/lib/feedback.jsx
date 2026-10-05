import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';

const Ctx = createContext(null);

const TONES = {
  success: { icon: CircleCheck, cls: 'text-green-400' },
  error: { icon: CircleX, cls: 'text-red-400' },
  info: { icon: Info, cls: 'text-sky-400' },
};

/** Toast messages + an in-app confirm dialog (instead of the browser's alert/confirm). */
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const idRef = useRef(0);

  const toast = useCallback((message, tone = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    setConfirmState({ ...opts, resolve });
  }), []);

  const close = (result) => { confirmState?.resolve(result); setConfirmState(null); };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[4000] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
        {toasts.map((t) => {
          const { icon: Icon, cls } = TONES[t.tone] || TONES.info;
          return (
            <div key={t.id} role="status" className="toast-in pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-[13px] text-white shadow-2xl">
              <Icon size={18} className={`mt-px shrink-0 ${cls}`} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[3500] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" role="alertdialog" aria-modal="true">
            <div className="flex gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${confirmState.danger ? 'bg-red-50 text-red-600' : 'bg-accent-soft text-ink'}`}>
                <TriangleAlert size={18} />
              </span>
              <div>
                <h2 className="font-semibold">{confirmState.title}</h2>
                {confirmState.message && <p className="mt-1 text-gray-500">{confirmState.message}</p>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => close(false)}>Cancel</button>
              <button type="button" autoFocus className={confirmState.danger ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-dark'} onClick={() => close(true)}>
                {confirmState.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useFeedback = () => useContext(Ctx);
