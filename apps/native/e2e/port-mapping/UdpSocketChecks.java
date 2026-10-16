package com.codexswitch.checks;

import android.util.Base64;
import com.tradle.react.UdpSocketClient;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketException;
import java.util.Arrays;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** Runs the patched production socket adapter on Android without replacing the installed app. */
public final class UdpSocketChecks implements UdpSocketClient.OnDataReceivedListener {
    private final LinkedBlockingQueue<byte[]> received = new LinkedBlockingQueue<>();

    public static void main(String[] args) throws Exception {
        new UdpSocketChecks().verify();
        System.out.println("UDP_SOCKET_PASS empty,binary,max-size,conflict,reuse");
    }

    private UdpSocketClient client() {
        return new UdpSocketClient(this, error -> { throw error; });
    }

    private void verify() throws Exception {
        InetAddress loopback = InetAddress.getByName("127.0.0.1");
        int port;
        try (DatagramSocket reservation = new DatagramSocket(0, loopback)) { port = reservation.getLocalPort(); }
        UdpSocketClient mapping = client();
        UdpSocketClient conflict = client();
        try (DatagramSocket sender = new DatagramSocket(0, loopback)) {
            mapping.bind(port, "127.0.0.1");
            try {
                conflict.bind(port, "127.0.0.1");
                throw new AssertionError("UDP listener accepted a conflicting port");
            } catch (SocketException expected) { /* Exclusive binding must fail. */ }
            sender.setSoTimeout(3000);
            for (int size : new int[] {0, 3, 65507, 1, 49152}) {
                byte[] bytes = new byte[size];
                for (int index = 0; index < size; index++) bytes[index] = (byte) index;
                sender.send(new DatagramPacket(bytes, bytes.length, loopback, port));
                if (!Arrays.equals(bytes, received.poll(3, TimeUnit.SECONDS))) {
                    throw new AssertionError("Received a truncated or missing datagram: " + size);
                }
                mapping.send(Base64.encodeToString(bytes, Base64.NO_WRAP), sender.getLocalPort(), "127.0.0.1", null);
                DatagramPacket reply = new DatagramPacket(new byte[65535], 65535);
                sender.receive(reply);
                if (!Arrays.equals(bytes, Arrays.copyOf(reply.getData(), reply.getLength()))) {
                    throw new AssertionError("Reply datagram differs: " + size);
                }
            }
        } finally { mapping.close(); conflict.close(); }
        try (DatagramSocket reused = new DatagramSocket(port, loopback)) {
            if (reused.getLocalPort() != port) throw new AssertionError("Port was not released");
        }
    }

    public void didReceiveData(UdpSocketClient socket, String data, String host, int port) {
        received.add(Base64.decode(data, Base64.NO_WRAP));
    }
    public void didReceiveError(UdpSocketClient socket, String message) {
        // Closing the listener intentionally interrupts its blocking receive.
    }
}
