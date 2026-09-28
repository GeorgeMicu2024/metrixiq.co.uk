import "../scorecard.css";
import "../scorecards-v22.css";
import "../mentor.css";
import "../governance-v2.css";
import "../manager-intelligence-v3.css";
import "../operations-intelligence-v4.css";
import "../intelligence-reporting-v5.css";
import "../platform-mobile-v6.css";
import "../enterprise-portfolio-v7.css";
import "../automation-workflows-v8.css";
import "../integration-delivery-v9.css";
import "../account-settings.css";
import PwaBootstrap from "../../components/pwa/PwaBootstrap";

export const metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PrivateRouteLayout({ children }) {
  return <><PwaBootstrap />{children}</>;
}
