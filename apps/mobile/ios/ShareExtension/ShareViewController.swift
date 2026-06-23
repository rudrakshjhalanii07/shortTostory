import UIKit
import UniformTypeIdentifiers

/// Minimal share extension that validates an incoming URL is a YouTube Short
/// and opens the main ShortStory app via the custom URL scheme:
///   shortstory://share?url=<percent-encoded YouTube Short URL>
///
/// Setup (after `expo prebuild`):
///   1. In Xcode, add a new "Share Extension" target named "ShareExtension".
///   2. Replace the generated ShareViewController.swift with this file.
///   3. Replace the generated Info.plist with ios/ShareExtension/Info.plist.
///   4. Set the deployment target to iOS 16.0+.
///   5. The extension does NOT need an App Group — it hands off immediately.
class ShareViewController: UIViewController {

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        handleSharedItem()
    }

    private func handleSharedItem() {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let provider = item.attachments?.first
        else {
            finish()
            return
        }

        let urlType = UTType.url.identifier

        guard provider.hasItemConformingToTypeIdentifier(urlType) else {
            finish()
            return
        }

        provider.loadItem(forTypeIdentifier: urlType) { [weak self] data, error in
            guard error == nil, let url = data as? URL else {
                DispatchQueue.main.async { self?.finish() }
                return
            }

            guard Self.isYouTubeShort(url) else {
                DispatchQueue.main.async { self?.finish() }
                return
            }

            DispatchQueue.main.async {
                self?.openMainApp(with: url)
            }
        }
    }

    private static func isYouTubeShort(_ url: URL) -> Bool {
        let str = url.absoluteString
        return str.contains("youtube.com/shorts/") || str.contains("youtu.be/")
    }

    private func openMainApp(with youtubeUrl: URL) {
        var components = URLComponents()
        components.scheme = "shortstory"
        components.host = "share"
        components.queryItems = [
            URLQueryItem(name: "url", value: youtubeUrl.absoluteString),
        ]

        guard let deepLink = components.url else {
            finish()
            return
        }

        extensionContext?.open(deepLink) { [weak self] _ in
            self?.finish()
        }
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
