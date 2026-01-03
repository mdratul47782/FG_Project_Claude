import FGEntryForm from "@/app/fgComponents/FGEntryForm";

export default function FGPage() {
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        Finished Goods Warehouse Entry + Row Allocation
      </h1>
      <FGEntryForm />
    </div>
  );
}
