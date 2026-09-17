import Navbar from "@/components/shadcn-space/blocks/navbar-01/navbar";

export default function HomeLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (

        <div>
            <Navbar />
            {children};
        </div>
    )
}