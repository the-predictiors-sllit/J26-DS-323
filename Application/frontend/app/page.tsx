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
      image: "/solar/solar (1).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (2).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (3).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (4).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (5).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (6).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (7).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (8).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (9).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (10).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (11).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (12).jpg",
      link: "/home",
      title: "Smarter Solar for Every Home",
      description:
        "Plan your solar setup, schedule appliances, check panel health, and prepare for power outages.",
    },
    {
      image: "/solar/solar (13).jpg",
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
