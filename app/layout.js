// app/layout.js
import { dbConnect } from "@/services/mongo";
import { Bebas_Neue, Poppins, Roboto } from "next/font/google";
import "./globals.css";
import AuthProvider from "./providers/AuthProvider";


const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas-neue",
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
});

export const metadata = {
  title: "HKD FG APP",
  description: "CREATED BY MD.RATUL",
};

export default async function RootLayout({ children }) {
  await dbConnect();

  return (
    <html lang="en">
      <body
        className={`
          ${poppins.variable}
          ${roboto.variable}
          ${bebasNeue.variable}
          antialiased
        `}
      >
        <AuthProvider>

          <div >{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}
