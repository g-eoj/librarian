import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import Chat from "../islands/Chat.tsx";

export default define.page(function Home() {
  return (
    <div class="print:bg-white">
      <Head>
        <title>Librarian</title>
        <style>
          {`
            @media print {
              body {
                background: white !important;
                color: black !important;
                font-size: 12pt;
                line-height: 1.5;
              }
              @page {
                margin: 1in;
              }
            }
          `}
        </style>
      </Head>
      <Chat />
    </div>
  );
});
