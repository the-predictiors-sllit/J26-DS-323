import InfiniteMenu from "@/components/react-bits/InfiniteMenu-TS-TW";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  const items = [
    {
      image: "/solar/solarhouse1.webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (1).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (2).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (3).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (4).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (5).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (6).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (7).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (8).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (9).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (10).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (11).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (12).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (13).webp",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
  ];
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
          // theme="light"
          accentColor="var(--primary)"
        />
      </div>
    </div>
  );
}

// {/* <Link href="/home" >
//   <Button>
//     Home
//   </Button>
// </Link> */}
