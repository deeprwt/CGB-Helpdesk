"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  onSubmit: (comment: string) => Promise<void>;
};

export default function TicketStatusDialog({
  open,
  onClose,
  title,
  onSubmit,
}: Props) {
  const [comment, setComment] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    await onSubmit(comment);
    setLoading(false);
    setComment("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Textarea
          placeholder="Add some description of the request"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-[120px]"
        />

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={loading}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
