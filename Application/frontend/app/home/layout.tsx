import Navbar from "@/components/shadcn-space/blocks/navbar-01/navbar";

export default function HomeLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (

        <div>
            <div className="fixed top-0 left-0 right-0 z-50">

                <Navbar />
            </div>
            {children};
        </div>
    )
}