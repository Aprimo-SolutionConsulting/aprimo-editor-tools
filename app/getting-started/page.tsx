import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { GettingStartedContent } from "@/components/getting-started-content"

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <GettingStartedContent />
      </main>
      <Footer />
    </div>
  )
}
