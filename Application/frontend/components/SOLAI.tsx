import React from "react";
import TechText from "./react-bits/TechText-TS-TW";

const SOLAI = () => {
  return (
    <div className=" w-screen ">
      <TechText
        text="SOLAI"
        fontWeight={600}
        fontSize={150}
        reveal="letter"
        dashLength={4}
        dashGap={2}
        specks={15}
        intro="none"
        introDuration={2}
        clickKick
        guides={false}
        fontFamily=""
        letterSpacing={-0.05}
        accentColor="currentColor"
        reach={200}
        softness={0.7}
        lineStyle="dashed"
        strokeWidth={1.5}
        speed={1}
        bounce={0.4}
        selection
        labels
        color="currentColor"
        align="center"
        draggable
        sweep
      />
    </div>
  );
};

export default SOLAI;
