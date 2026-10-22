"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import InfiniteMenu from "@/components/react-bits/InfiniteMenu-TS-TW";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const items = [
    {
      image: "/solar/solarhouse1.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar1.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar2.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar3.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar4.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar5.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar6.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar7.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar8.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar12.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
  ];

  const currentTheme = mounted && resolvedTheme === "dark" ? "dark" : "light";

  return (
    <div className="">
      <div className="h-screen">
        <InfiniteMenu
          items={items}
          count={160}
          tileSize={0.63}
          roundness={0.2}
          zoom={1.65}
          pullBack={1}
          stretch={0.6}
          inertia={0.6}
          autoplay={3}
          grayscale
          dim={0.5}
          intro
          showInfo
          theme={currentTheme}
          accentColor="var(--primary)"
        />
      </div>
    </div>
  );
}