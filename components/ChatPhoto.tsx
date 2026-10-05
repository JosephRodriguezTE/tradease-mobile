import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';

// A photo message's image. Photos live in the work-orders bucket (the
// work-order chat uploads them) and are referenced by messages.media_path;
// the signed URL is fetched per bubble.
export function ChatPhoto({ mediaPath, textColor }: { mediaPath: string; textColor: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    supabase.storage.from('work-orders').createSignedUrl(mediaPath, 3600).then(({ data, error }) => {
      if (!live) return;
      if (error || !data?.signedUrl) setFailed(true);
      else setUrl(data.signedUrl);
    });
    return () => { live = false; };
  }, [mediaPath]);

  if (failed) return <Text style={{ fontSize: 13, color: textColor, opacity: 0.7 }}>Photo unavailable</Text>;
  if (!url) {
    return (
      <View style={{ width: 200, height: 150, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={textColor} />
      </View>
    );
  }
  return (
    <TouchableOpacity onPress={() => Linking.openURL(url)} accessibilityLabel="Photo" activeOpacity={0.85}>
      <Image source={{ uri: url }} style={{ width: 200, height: 150, borderRadius: 12 }} resizeMode="cover" testID="chat-photo" />
    </TouchableOpacity>
  );
}
