
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { BrainCircuit } from 'lucide-react';

interface RoleDialogProps {
  roleInfo: { role: string; message: string } | null;
  onOpenChange: (open: boolean) => void;
}

export default function RoleDialog({ roleInfo, onOpenChange }: RoleDialogProps) {
  return (
    <AlertDialog open={!!roleInfo} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <BrainCircuit />Your Secret Role
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-2">
            {roleInfo?.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Got it!</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

