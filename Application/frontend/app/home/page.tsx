import { Features_block } from "@/components/features_block";
import HeroSection from "@/components/shadcn-space/blocks/hero-03/hero";

export default function Home() {
  return (
    <div className="snap-y h-screen overflow-y-scroll " >
      <div className="snap-end  snap-always h-screen">
        <HeroSection />
      </div>
      <div className="snap-end snap-always h-screen pt-25">
        <div className=" flex flex-col  items-center justify-center">
          <section>
            <Features_block />
          </section>
        </div>
      </div>
    </div>
  );
}
