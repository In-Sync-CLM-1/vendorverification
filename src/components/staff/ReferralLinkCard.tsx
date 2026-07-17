import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, QrCode, Link2 } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

interface ReferralLinkCardProps {
  referralCode: string;
  isLoading: boolean;
}

export function ReferralLinkCard({ referralCode, isLoading }: ReferralLinkCardProps) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const referralUrl = referralCode
    ? `https://vendor.in-sync.co.in/register/ref/${referralCode}`
    : "";

  useEffect(() => {
    if (!referralUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, referralUrl, {
      width: 200,
      margin: 2,
      color: { dark: "#1a1a2e", light: "#ffffff" },
    });
  }, [referralUrl]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    toast.success("Referral link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center h-48">
          <div className="animate-pulse text-muted-foreground">Loading referral code...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          My Referral Link
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* QR Code */}
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white p-3 rounded-xl shadow-sm border">
            <canvas ref={canvasRef} className="rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Scan to register</span>
          </div>
        </div>

        {/* Referral Code */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Referral Code</p>
          <Badge variant="outline" className="text-lg font-mono px-4 py-1.5">
            {referralCode}
          </Badge>
        </div>

        {/* Copyable URL */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Shareable Link</p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={referralUrl}
              className="text-xs font-mono bg-muted/50"
            />
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
