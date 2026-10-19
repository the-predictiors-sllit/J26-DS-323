import { Abouttheproject } from "@/components/Abouttheproject";
import { Features_block } from "@/components/features_block";
import HeroSection from "@/components/shadcn-space/blocks/hero-03/hero";
import SOLAI from "@/components/SOLAI";

export default function Home() {
  return (
    <div className="snap-y h-screen overflow-y-scroll ">
      <div className="snap-center snap-always h-screen">
        <HeroSection />
      </div>
      <div className="snap-end snap-always h-screen ">
        <div className=" snap-end snap-always flex min-h-screen items-center justify-center px-5">
          <Abouttheproject />
        </div>
      </div>
      <div className="snap-end snap-always h-screen dark:bg-card bg-primary/9">
        <div className="flex min-h-svh w-full snap-start items-center justify-center  light:bg-primary/1 dark:bg-card/1">
          <Features_block />
        </div>
      </div>
      <div className="snap-end snap-always h-screen ">
        <div className="snap-end snap-always flex min-h-screen items-center justify-center">
          <SOLAI />
        </div>
      </div>
    </div>
  );
}
