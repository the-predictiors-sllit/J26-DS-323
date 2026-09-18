"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

const projects5prop = [
  {
    title: "Panel Health",
    img: "https://images.pexels.com/photos/33379364/pexels-photo-33379364.jpeg",
    type: "Detect and assess potential solar",
    url: "/features/panelhealth",
  },
  {
    title: "Solar Setup",
    img: "https://images.pexels.com/photos/34641328/pexels-photo-34641328.jpeg",
    type: "Optimize panel placement, tilt, and shading",
    url: "/features/solarsetup",
  },
  {
    title: "Smart Scheduling",
    img: "https://images.pexels.com/photos/9800029/pexels-photo-9800029.jpeg",
    type: "Schedule appliances around available solar energy",
    url: "/features/smartscheduling",
  },
  {
    title: "Energy Resilience",
    img: "https://images.pexels.com/photos/39057090/pexels-photo-39057090.jpeg",
    type: "Manage solar and battery energy during outages",
    url: "/features/energyresilience",
  },
];

interface Projects5Props {
  className?: string;
}

const Features_block = ({ className }: Projects5Props) => {
  return (
    <section className={cn("", className)}>
      <div className="container">
        <h1 className="text-7xl leading-tight uppercase">Features</h1>


        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
          {projects5prop.map((project, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group overflow-hidden rounded-lg border border-border bg-background"
            >
              <a href={project.url} className="block overflow-hidden">
                <img
                  src={project.img}
                  alt={project.title}
                  className="h-80 w-screen object-cover transition-transform duration-500 ease-in-out group-hover:scale-105"
                />
              </a>
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold">{project.title}</h2>
                  <p className="text-muted-foreground">{project.type}</p>
                </div>

              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export { Features_block };
