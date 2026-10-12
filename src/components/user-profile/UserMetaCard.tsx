"use client";
import React from "react";
import { Facebook, Instagram, Linkedin, Pencil, Twitter, type LucideIcon } from "lucide-react";
import { useModal } from "../../hooks/useModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";

const SOCIAL_LINKS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Facebook", href: "https://www.facebook.com/PimjoHQ", icon: Facebook },
  { label: "X.com", href: "https://x.com/PimjoHQ", icon: Twitter },
  { label: "Linkedin", href: "https://www.linkedin.com/company/pimjo", icon: Linkedin },
  { label: "Instagram", href: "https://instagram.com/PimjoHQ", icon: Instagram },
];

export default function UserMetaCard() {
  const { isOpen, openModal, closeModal } = useModal();
  const handleSave = () => {
    // Handle save logic here
    console.log("Saving changes...");
    closeModal();
  };
  return (
    <>
      <Card className="py-5 lg:py-6">
        <CardContent className="lg:px-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex w-full flex-col items-center gap-6 xl:flex-row">
              <Avatar className="size-20 shadow-md ring-4 ring-indigo-50 dark:ring-indigo-500/20">
                <AvatarImage src="/images/user/owner.jpg" alt="user" className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-lg font-semibold text-white">
                  MC
                </AvatarFallback>
              </Avatar>
              <div className="order-3 xl:order-2">
                <h4 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-white xl:text-left">
                  Musharof Chowdhury
                </h4>
                <div className="flex flex-col items-center gap-1 text-center xl:flex-row xl:gap-3 xl:text-left">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Team Manager</p>
                  <Separator orientation="vertical" className="hidden data-[orientation=vertical]:h-3.5 xl:block" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Arizona, United States</p>
                </div>
              </div>
              <div className="order-2 flex grow items-center gap-2 xl:order-3 xl:justify-end">
                {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
                  <Tooltip key={label}>
                    <TooltipTrigger asChild>
                      <Button
                        asChild
                        variant="outline"
                        size="icon-lg"
                        className="rounded-full text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300"
                      >
                        <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
                          <Icon className="size-5" />
                        </a>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
            <Button variant="outline" onClick={openModal} className="w-full rounded-full lg:w-auto">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={(open) => (open ? openModal() : closeModal())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Edit Personal Information</DialogTitle>
            <DialogDescription>
              Update your details to keep your profile up-to-date.
            </DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
            <FieldSet>
              <FieldLegend>Social Links</FieldLegend>
              <FieldGroup className="sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="meta-facebook">Facebook</FieldLabel>
                  <Input id="meta-facebook" type="text" defaultValue="https://www.facebook.com/PimjoHQ" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="meta-x">X.com</FieldLabel>
                  <Input id="meta-x" type="text" defaultValue="https://x.com/PimjoHQ" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="meta-linkedin">Linkedin</FieldLabel>
                  <Input
                    id="meta-linkedin"
                    type="text"
                    defaultValue="https://www.linkedin.com/company/pimjo"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="meta-instagram">Instagram</FieldLabel>
                  <Input id="meta-instagram" type="text" defaultValue="https://instagram.com/PimjoHQ" />
                </Field>
              </FieldGroup>
            </FieldSet>

            <Separator />

            <FieldSet>
              <FieldLegend>Personal Information</FieldLegend>
              <FieldGroup className="sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="meta-first-name">First Name</FieldLabel>
                  <Input id="meta-first-name" type="text" defaultValue="Musharof" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="meta-last-name">Last Name</FieldLabel>
                  <Input id="meta-last-name" type="text" defaultValue="Chowdhury" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="meta-email">Email Address</FieldLabel>
                  <Input id="meta-email" type="text" defaultValue="randomuser@pimjo.com" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="meta-phone">Phone</FieldLabel>
                  <Input id="meta-phone" type="text" defaultValue="+09 363 398 46" />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="meta-bio">Bio</FieldLabel>
                  <Input id="meta-bio" type="text" defaultValue="Team Manager" />
                </Field>
              </FieldGroup>
            </FieldSet>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                Close
              </Button>
              <Button type="button" onClick={handleSave}>
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
