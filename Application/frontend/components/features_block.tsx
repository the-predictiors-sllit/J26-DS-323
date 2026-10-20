"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "Panel Health",
    img: "feature/PanelHealth.webp",
    description: "Assess panel condition and explore maintenance guidance.",
    url: "/features/panelhealth",
  },
  {
    title: "Solar Setup",
    img: "feature/SolarSetup.webp",
    description: "Explore panel placement, tilt, and orientation.",
    url: "/features/solarsetup",
  },
  {
    title: "Smart Scheduling",
    img: "feature/SmartScheduling.webp",
    description: "Schedule appliances around available solar energy.",
    url: "/features/smartscheduling/scheduler",
  },
  {
    title: "Energy Resilience",
    img: "feature/EnergyResilience.webp",
    description: "Plan solar and battery energy use for power outages.",
    url: "/features/energyresilience",
  },
];

interface FeaturesBlockProps {
  className?: string;
}

const Features_block = ({ className }: FeaturesBlockProps) => {
  return (
    <section
      aria-labelledby="features-heading"
      className={cn(
        "flex w-full min-w-0 items-center justify-center px-4 py-8 sm:px-6 lg:px-8 lg:py-12",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-5 text-center lg:mb-8">
          <h2
            id="features-heading"
            className="text-3xl font-semibold uppercase tracking-tight sm:text-4xl lg:text-6xl text-primary"
          >
            Features
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Four tools to help you make more of your solar energy.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-5">
          {features.map((feature, index) => (
            <motion.div
              key={feature.url}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              viewport={{ once: true, amount: 0.1 }}
              className="h-full min-w-0"
            >
              <Link
                href={feature.url}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-background transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <div className="overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={feature.img}
                    alt={feature.title}
                    loading="lazy"
                    decoding="async"
                    width={640}
                    height={320}
                    className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-36 md:h-40 lg:h-48 xl:h-52 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </div>

                <div className="flex flex-1 items-start gap-3 p-3 lg:p-5">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold transition-colors group-hover:text-primary lg:text-lg">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>

                  <ArrowUpRight
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary lg:size-5"
                  />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export { Features_block };