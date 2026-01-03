// app\api\rows\[id]\route.js
import { dbConnect } from "@/services/mongo";
import Row from "@/models/Row";

export async function GET(_req, { params }) {
  await dbConnect();
  const row = await Row.findById(params.id).lean();
  if (!row) return Response.json({ ok: false, message: "Row not found" }, { status: 404 });
  return Response.json({ ok: true, row });
}

export async function PATCH(req, { params }) {
  await dbConnect();
  const body = await req.json();
  const row = await Row.findByIdAndUpdate(params.id, body, { new: true }).lean();
  if (!row) return Response.json({ ok: false, message: "Row not found" }, { status: 404 });
  return Response.json({ ok: true, row });
}

export async function DELETE(_req, { params }) {
  await dbConnect();
  const row = await Row.findByIdAndDelete(params.id).lean();
  if (!row) return Response.json({ ok: false, message: "Row not found" }, { status: 404 });
  return Response.json({ ok: true });
}
