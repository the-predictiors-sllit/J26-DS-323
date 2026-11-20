"use client";

import { CircleHelp } from "lucide-react";
import { FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A separate help button keeps the form label and its input associated. */
export function HelpLabel({ htmlFor, label, help }: { htmlFor?: string; label: string; help: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {htmlFor ? <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel> : <span className="text-xs text-muted-foreground">{label}</span>}
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={<PopoverTrigger aria-label={`Help: ${label}`} />}
            type="button"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CircleHelp className="size-4" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent className="max-w-72 whitespace-normal leading-relaxed">{help}</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="max-w-[calc(100vw-2rem)] gap-2">
          <p className="font-medium">{label}</p>
          <p className="leading-relaxed text-muted-foreground">{help}</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
