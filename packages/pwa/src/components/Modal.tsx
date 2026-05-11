import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  variant?: 'center' | 'bottom-sheet';
  containerClass?: string;
}

export function Modal({ open, onClose, children, variant = 'center', containerClass = '' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-root"
          className="fixed inset-0 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          {variant === 'bottom-sheet' ? (
            <motion.div
              className={`absolute inset-x-0 bottom-0 z-10 ${containerClass}`}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              {children}
            </motion.div>
          ) : (
            <div
              className={`absolute inset-0 flex items-center justify-center p-4 ${containerClass}`}
              onClick={onClose}
            >
              <motion.div
                className="relative bg-white dark:bg-[#121212] rounded-xl shadow-xl border border-border w-full max-w-md max-h-[80vh] flex flex-col"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
              >
                {children}
              </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
