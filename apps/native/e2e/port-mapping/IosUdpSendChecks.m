#import <Foundation/Foundation.h>
#import "UdpSocketClient.h"
#import <arpa/inet.h>
#import <sys/socket.h>
#import <unistd.h>

static const NSUInteger PacketCount = 24;
static const NSTimeInterval CheckTimeout = 10;

static void Require(BOOL condition, NSString *message) {
    if (!condition) @throw [NSException exceptionWithName:@"UdpSendCheck" reason:message userInfo:nil];
}

static void WaitFor(BOOL (^ready)(void)) {
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:CheckTimeout];
    while (!ready() && [deadline timeIntervalSinceNow] > 0) {
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.01]];
    }
    Require(ready(), @"Timed out waiting for native UDP completion");
}

static int Client(uint16_t *port) {
    int descriptor = socket(AF_INET, SOCK_DGRAM, 0);
    Require(descriptor >= 0, @"Unable to create UDP client");
    struct sockaddr_in address = {0};
    address.sin_len = sizeof(address);
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    Require(bind(descriptor, (struct sockaddr *)&address, sizeof(address)) == 0, @"Unable to bind client");
    socklen_t length = sizeof(address);
    Require(getsockname(descriptor, (struct sockaddr *)&address, &length) == 0, @"Unable to read client port");
    *port = ntohs(address.sin_port);
    return descriptor;
}

static NSData *Receive(int descriptor, uint16_t port) {
    __block NSData *received = nil;
    WaitFor(^BOOL {
        uint8_t buffer[64];
        struct sockaddr_in source = {0};
        socklen_t length = sizeof(source);
        ssize_t count = recvfrom(descriptor, buffer, sizeof(buffer), MSG_DONTWAIT,
            (struct sockaddr *)&source, &length);
        if (count < 0) return NO;
        Require(ntohs(source.sin_port) == port, @"Reply came from a different mapping port");
        received = [NSData dataWithBytes:buffer length:(NSUInteger)count];
        return YES;
    });
    return received;
}

@interface UdpChecks : NSObject <SocketClientDelegate>
@property(nonatomic, strong) NSMutableSet<NSNumber *> *peers;
@end
@implementation UdpChecks
- (void)onData:(UdpSocketClient *)client data:(NSData *)data host:(NSString *)host port:(uint16_t)port {
    Require([host isEqualToString:@"127.0.0.1"], @"Unexpected UDP peer");
    [self.peers addObject:@(port)];
}
@end

static void RegisterPeer(int descriptor, uint16_t port) {
    struct sockaddr_in destination = {0};
    destination.sin_len = sizeof(destination);
    destination.sin_family = AF_INET;
    destination.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    destination.sin_port = htons(port);
    Require(sendto(descriptor, "peer", 4, 0, (struct sockaddr *)&destination, sizeof(destination)) == 4,
        @"Unable to register peer");
}

static void CheckReplies(UdpSocketClient *listener, int clients[2], uint16_t ports[2]) {
    const uint16_t mappingPort = [[listener address][@"port"] unsignedShortValue];
    for (NSUInteger index = 0; index < PacketCount; index++) {
        // Empty responses to each peer are followed by distinct ordinary responses to both peers.
        NSString *message = [NSString stringWithFormat:@"peer-%lu-packet-%lu", index % 2, index];
        NSData *payload = index < 2 ? [NSData data] : [message dataUsingEncoding:NSUTF8StringEncoding];
        __block NSUInteger callbacks = 0;
        [listener send:payload remotePort:ports[index % 2] remoteAddress:@"127.0.0.1" callback:^(NSArray *result) {
            Require(result.count == 0, [NSString stringWithFormat:@"UDP send failed: %@", result]);
            callbacks++;
        }];
        WaitFor(^BOOL { return callbacks > 0; });
        Require(callbacks == 1, @"Native send callback was invoked more than once");
        Require([Receive(clients[index % 2], mappingPort) isEqualToData:payload], @"UDP data crossed peers or changed");
    }
}

int main(void) {
    @autoreleasepool {
        @try {
            UdpChecks *checks = [UdpChecks new];
            checks.peers = [NSMutableSet new];
            UdpSocketClient *listener = [UdpSocketClient socketClientWithConfig:checks];
            NSError *error = nil;
            Require([listener bind:0 address:@"127.0.0.1" options:@{@"reusePort":@NO} error:&error],
                error.localizedDescription ?: @"Unable to bind mapping");
            uint16_t ports[2];
            int clients[2] = {Client(&ports[0]), Client(&ports[1])};
            uint16_t mappingPort = [[listener address][@"port"] unsignedShortValue];
            RegisterPeer(clients[0], mappingPort);
            RegisterPeer(clients[1], mappingPort);
            WaitFor(^BOOL { return checks.peers.count == 2; });
            CheckReplies(listener, clients, ports);
            [listener close];
            close(clients[0]); close(clients[1]);
            puts("IOS_UDP_SEND_PASS: empty replies and subsequent packets reached both peers");
            return 0;
        } @catch (NSException *error) {
            fprintf(stderr, "%s\n", error.reason.UTF8String);
            return 1;
        }
    }
}
