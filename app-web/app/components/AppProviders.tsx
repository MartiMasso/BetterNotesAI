"use client";

import { ToastProvider } from "./Toast";
import { DialogProvider } from "./ConfirmDialog";

export function AppProviders({ children }: { children: React.ReactNode }) {
    return (
        <DialogProvider>
            <ToastProvider>
                {children}
            </ToastProvider>
        </DialogProvider>
    );
}
