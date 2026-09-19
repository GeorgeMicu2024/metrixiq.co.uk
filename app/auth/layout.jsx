export const metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function PrivateRouteLayout({ children }) {
  return children;
}
