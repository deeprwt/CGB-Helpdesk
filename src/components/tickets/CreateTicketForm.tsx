"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export default function CreateTicketForm() {
  const [loading, setLoading] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    const res = await fetch("/api/tickets/create", {
      method: "POST",
      body: formData,
    })

    setLoading(false)

    if (!res.ok) {
      toast.error("Failed to create ticket", {
        description: "Please try again later",
      })
      return
    }

    toast.success("🎫 Ticket created successfully", {
      description: "Your request has been submitted",
    })

    e.currentTarget.reset()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Requester</Label>
          <Input name="requester_name" placeholder="New" />
        </div>
        <div>
          <Label>Contact</Label>
          <Input name="contact" placeholder="Low" />
        </div>
      </div>

      {/* Subject */}
      <div>
        <Label>Subject *</Label>
        <Input name="subject" placeholder="Enter Subject" required />
      </div>

      {/* Description */}
      <div>
        <Label>Description</Label>
        <Textarea
          name="description"
          placeholder="Enter Description"
          rows={4}
        />
      </div>

      {/* Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Category</Label>
          <Select name="category">
            <SelectTrigger>
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="hardware">Hardware</SelectItem>
              <SelectItem value="software">Software</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Sub-Category</Label>
          <Select name="sub_category">
            <SelectTrigger>
              <SelectValue placeholder="Select Sub Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Priority / Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Priority</Label>
          <Select name="priority">
            <SelectTrigger>
              <SelectValue placeholder="New" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Status</Label>
          <Select name="status">
            <SelectTrigger>
              <SelectValue placeholder="Low" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Urgency / Impact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Urgency</Label>
          <Select name="urgency">
            <SelectTrigger>
              <SelectValue placeholder="Low" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Impact</Label>
          <Input name="impact" placeholder="New" />
        </div>
      </div>

      {/* Assignee / Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Assignee</Label>
          <Input name="assignee" placeholder="UI UX Team" />
        </div>
        <div>
          <Label>Location</Label>
          <Input name="location" placeholder="Bangalore" />
        </div>
      </div>

      {/* Inventory / Attachments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Inventory</Label>
          <Input name="inventory" placeholder="Laptop" />
        </div>
        <div>
          <Label>Attachments</Label>
          <Input
            type="file"
            name="attachments"
            multiple
            accept=".png,.jpg,.jpeg,.pdf,.doc,.docx"
          />
        </div>
      </div>

      {/* Link / CC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Link</Label>
          <Input name="link" placeholder="Link" />
        </div>
        <div>
          <Label>CC</Label>
          <Input name="cc" placeholder="abc@gmail.com" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4 pt-4">
        <Button type="button" variant="outline">
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create"}
        </Button>
      </div>
    </form>
  )
}
