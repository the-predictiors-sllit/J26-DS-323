import { Button } from "@/components/ui/button";
import Link from "next/link";


export default function Home() {
  return (
    <div className="" >
      <Link href="/home" >
        <Button>
          Home
        </Button>
      </Link>
    </div>
  );
}
