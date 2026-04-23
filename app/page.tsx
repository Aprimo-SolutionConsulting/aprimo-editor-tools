import { Navbar } from "@/components/navbar"
import { ConnectSection } from "@/components/connect-section"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <ConnectSection />
      </main>
      <Footer />
    </div>
  )
}
