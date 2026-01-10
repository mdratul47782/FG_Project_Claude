// app/fg/page.jsx
import FGEntryForm from "@/app/fgComponents/FGEntryForm";
import Image from "next/image";

export default function FGPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-screen-2xl px-2 py-0.5">
        {/* <div className="mb-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
         
          <div className="flex items-center gap-3">
           
            <div className="relative h-10 w-12 overflow-hidden rounded-lg">
              <Image
                src="/HKD_LOGO.png"
                alt="HKD Outdoor Innovations Ltd."
                fill
                className="object-contain"
                priority
              />
            </div>

          
            <div className="leading-tight">
              <p className="text-semibold font-semibold text-slate-900">
                HKD Outdoor Innovations Ltd.
              </p>
              <p className="text-xs text-slate-500">
                Finished Goods Warehouse
              </p>
            </div>
          </div>


        </div> */}

        <FGEntryForm />
      </div>
    </div>
  );
}
