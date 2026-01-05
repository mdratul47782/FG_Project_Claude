import Image from "next/image";
import SignInOut from "./AuthComponents/SignInOut";
import Link from "next/link";
export default function Home() {
  return (
    <>
     
    
      <SignInOut/>
      <Link href="/fg" className="bg-blue-400 rounded-md p-2  flex m-auto mt-4 w-30 font-semibold">GO TO FG WAREHOUSE</Link>
    </>
  );
}
